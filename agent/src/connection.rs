use crate::execution::{execute_command, CommandPayload};
use crate::telemetry::collect_telemetry;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{debug, error, info, warn};

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsWriter = futures_util::stream::SplitSink<WsStream, Message>;
type SharedWriter = Arc<Mutex<WsWriter>>;

#[derive(Debug)]
pub enum AgentError {
    Connect(String),
    Protocol(String),
    Send(String),
    Receive(String),
    Disconnected(String),
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentError::Connect(message)
            | AgentError::Protocol(message)
            | AgentError::Send(message)
            | AgentError::Receive(message)
            | AgentError::Disconnected(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for AgentError {}

impl AgentError {
    fn was_connected(&self) -> bool {
        matches!(self, AgentError::Disconnected(_))
    }
}

pub struct AgentConnection {
    pub server_url: String,
    pub agent_id: String,
    pub api_key: String,
    pub reconnect_delay_ms: u64,
    pub max_reconnect_delay_ms: u64,
}

impl AgentConnection {
    pub async fn run_forever(&self) {
        let mut delay_ms = self.reconnect_delay_ms;

        loop {
            match self.connect_and_run().await {
                Ok(()) => warn!("connection ended cleanly; reconnecting"),
                Err(err) => {
                    if err.was_connected() {
                        delay_ms = self.reconnect_delay_ms;
                    }
                    warn!(error = %err, delay_ms, "connection dropped; reconnecting");
                }
            }

            sleep(Duration::from_millis(delay_ms)).await;
            delay_ms = (delay_ms * 2).min(self.max_reconnect_delay_ms);
        }
    }

    async fn connect_and_run(&self) -> Result<(), AgentError> {
        let websocket_url = socketio_websocket_url(&self.server_url);
        info!(url = %websocket_url, "connecting to Axon control plane");

        let request = websocket_url
            .into_client_request()
            .map_err(|err| AgentError::Connect(err.to_string()))?;
        let (stream, _) = connect_async(request)
            .await
            .map_err(|err| AgentError::Connect(err.to_string()))?;
        let (writer, mut reader) = stream.split();
        let writer = Arc::new(Mutex::new(writer));

        match reader.next().await {
            Some(Ok(Message::Text(text))) if text.starts_with('0') => {
                debug!(packet = %text, "received engine.io open packet");
            }
            Some(Ok(message)) => {
                return Err(AgentError::Protocol(format!(
                    "expected open packet, got {message:?}"
                )));
            }
            Some(Err(err)) => return Err(AgentError::Receive(err.to_string())),
            None => return Err(AgentError::Receive("connection closed during handshake".to_string())),
        }

        let auth_packet = format!(
            "40{}",
            json!({
                "agentId": self.agent_id,
                "apiKey": self.api_key,
            })
        );
        send_text(&writer, auth_packet).await?;

        match reader.next().await {
            Some(Ok(Message::Text(text))) if text.starts_with("40") => {
                info!("connected to Axon control plane");
            }
            Some(Ok(Message::Text(text))) if text.starts_with("44") => {
                return Err(AgentError::Protocol(format!("authentication failed: {text}")));
            }
            Some(Ok(message)) => {
                return Err(AgentError::Protocol(format!(
                    "unexpected auth response: {message:?}"
                )));
            }
            Some(Err(err)) => return Err(AgentError::Receive(err.to_string())),
            None => return Err(AgentError::Receive("connection closed during auth".to_string())),
        }

        self.command_listener_loop(writer, &mut reader)
            .await
            .map_err(|err| AgentError::Disconnected(err.to_string()))
    }

    async fn heartbeat_loop(writer: SharedWriter) -> Result<(), AgentError> {
        let mut interval = tokio::time::interval(Duration::from_secs(5));

        loop {
            interval.tick().await;
            let telemetry = collect_telemetry();
            let packet = socketio_event_packet("heartbeat", json!(telemetry));
            send_text(&writer, packet).await?;
            debug!("heartbeat sent");
        }
    }

    async fn command_listener_loop(
        &self,
        writer: SharedWriter,
        reader: &mut futures_util::stream::SplitStream<WsStream>,
    ) -> Result<(), AgentError> {
        let heartbeat_writer = Arc::clone(&writer);
        let heartbeat_task = tokio::spawn(async move { Self::heartbeat_loop(heartbeat_writer).await });
        tokio::pin!(heartbeat_task);

        loop {
            tokio::select! {
                heartbeat_result = &mut heartbeat_task => {
                    return match heartbeat_result {
                        Ok(Ok(())) => Ok(()),
                        Ok(Err(err)) => Err(err),
                        Err(err) => Err(AgentError::Send(err.to_string())),
                    };
                }
                message = reader.next() => {
                    match message {
                        Some(Ok(Message::Text(text))) => {
                            self.handle_text_packet(&writer, &text).await?;
                        }
                        Some(Ok(Message::Ping(payload))) => {
                            writer.lock().await.send(Message::Pong(payload)).await
                                .map_err(|err| AgentError::Send(err.to_string()))?;
                        }
                        Some(Ok(Message::Close(frame))) => {
                            return Err(AgentError::Receive(format!("websocket closed: {frame:?}")));
                        }
                        Some(Ok(_)) => {}
                        Some(Err(err)) => return Err(AgentError::Receive(err.to_string())),
                        None => return Err(AgentError::Receive("websocket stream ended".to_string())),
                    }
                }
            }
        }
    }

    async fn handle_text_packet(
        &self,
        writer: &SharedWriter,
        text: &str,
    ) -> Result<(), AgentError> {
        if text == "2" {
            send_text(writer, "3".to_string()).await?;
            return Ok(());
        }

        if let Some((event_name, payload)) = parse_socketio_event(text) {
            if event_name == "execute_command" {
                let command_payload: CommandPayload = serde_json::from_value(payload)
                    .map_err(|err| AgentError::Protocol(err.to_string()))?;
                let result_writer = Arc::clone(writer);

                tokio::spawn(async move {
                    let job_id = command_payload.job_id.clone();
                    info!(job_id = %job_id, "executing command");
                    let result = execute_command(command_payload).await;
                    let packet = socketio_event_packet("command_result", json!(result));

                    if let Err(err) = send_text(&result_writer, packet).await {
                        error!(error = %err, "failed to send command result");
                    } else {
                        info!(job_id = %job_id, "command result sent");
                    }
                });
            }
        }

        Ok(())
    }
}

async fn send_text(writer: &SharedWriter, text: String) -> Result<(), AgentError> {
    writer
        .lock()
        .await
        .send(Message::Text(text.into()))
        .await
        .map_err(|err| AgentError::Send(err.to_string()))
}

fn socketio_event_packet(event_name: &str, payload: Value) -> String {
    format!("42{}", json!([event_name, payload]))
}

fn parse_socketio_event(text: &str) -> Option<(String, Value)> {
    let json_text = text.strip_prefix("42")?;
    let value: Value = serde_json::from_str(json_text).ok()?;
    let event_name = value.get(0)?.as_str()?.to_string();
    let payload = value.get(1).cloned().unwrap_or(Value::Null);
    Some((event_name, payload))
}

fn socketio_websocket_url(server_url: &str) -> String {
    let mut url = server_url.trim_end_matches('/').to_string();

    if url.starts_with("https://") {
        url = url.replacen("https://", "wss://", 1);
    } else if url.starts_with("http://") {
        url = url.replacen("http://", "ws://", 1);
    }

    format!("{url}/socket.io/?EIO=4&transport=websocket")
}
