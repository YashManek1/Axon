use crate::execution::{execute_command, CommandPayload};
use crate::sandbox::SandboxMode;
use crate::telemetry::collect_telemetry;
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::{Mutex, RwLock};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;
type WsWriter = futures_util::stream::SplitSink<WsStream, Message>;
type SharedWriter = Arc<Mutex<WsWriter>>;
type HmacSha256 = Hmac<Sha256>;

const DISPATCH_MAX_SKEW_MS: u64 = 5_000;
const NONCE_SET_MAX_SIZE: usize = 10_000;
const MAX_OUTPUT_BYTES_PER_STREAM: u64 = 65_536;

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

#[derive(Debug, Deserialize)]
struct DispatchPayload {
    #[serde(rename = "protocolVersion")]
    protocol_version: u8,
    #[serde(rename = "orgId")]
    org_id: String,
    #[serde(rename = "jobId")]
    job_id: String,
    #[serde(rename = "targetAgentId")]
    target_agent_id: String,
    #[serde(rename = "runId")]
    run_id: String,
    #[serde(rename = "targetExecutionId")]
    target_execution_id: String,
    #[serde(rename = "attemptId")]
    attempt_id: String,
    #[serde(rename = "operationId")]
    operation_id: String,
    #[serde(rename = "actionVersion")]
    action_version: String,
    command: String,
    nonce: String,
    ts: u64,
    sig: String,
    #[serde(rename = "allowedCommands", default)]
    allowed_commands: Vec<String>,
    #[serde(rename = "timeoutMs")]
    timeout_ms: u64,
    #[serde(rename = "startBefore")]
    start_before: u64,
    #[serde(rename = "maxOutputBytes")]
    max_output_bytes: u64,
}

// Refresh the short-lived token 3 minutes before it expires (15 min TTL → refresh at 12 min).
const TOKEN_REFRESH_INTERVAL_SECS: u64 = 720;

pub struct AgentConnection {
    pub server_url: String,
    pub agent_id: String,
    /// Long-lived break-glass credential; only used when no short token is available.
    pub api_key: String,
    /// Short-lived JWT issued by the server; refreshed every ~12 minutes.
    pub short_token: Arc<RwLock<String>>,
    pub reconnect_delay_ms: u64,
    pub max_reconnect_delay_ms: u64,
    pub signing_key: Vec<u8>,
    /// Sandbox mode applied to every dispatched command.  Read from
    /// `AGENT_SANDBOX_MODE` at startup; set by the operator from the
    /// `POST /agents/register` response.
    pub sandbox_mode: SandboxMode,
    http_client: reqwest::Client,
    seen_nonces: std::sync::Mutex<HashSet<String>>,
}

impl AgentConnection {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        server_url: String,
        agent_id: String,
        api_key: String,
        initial_short_token: String,
        reconnect_delay_ms: u64,
        max_reconnect_delay_ms: u64,
        signing_key: Vec<u8>,
        sandbox_mode: SandboxMode,
    ) -> Self {
        Self {
            server_url,
            agent_id,
            api_key,
            short_token: Arc::new(RwLock::new(initial_short_token)),
            reconnect_delay_ms,
            max_reconnect_delay_ms,
            signing_key,
            sandbox_mode,
            http_client: reqwest::Client::new(),
            seen_nonces: std::sync::Mutex::new(HashSet::new()),
        }
    }

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
            None => {
                return Err(AgentError::Receive(
                    "connection closed during handshake".to_string(),
                ))
            }
        }

        let current_token = self.short_token.read().await.clone();
        let auth_packet = if !current_token.is_empty() {
            format!(
                "40{}",
                json!({ "agentId": self.agent_id, "shortToken": current_token, "protocolVersions": [2] })
            )
        } else {
            format!(
                "40{}",
                json!({ "agentId": self.agent_id, "apiKey": self.api_key, "protocolVersions": [2] })
            )
        };
        send_text(&writer, auth_packet).await?;

        match reader.next().await {
            Some(Ok(Message::Text(text))) if text.starts_with("40") => {
                info!("connected to Axon control plane");
            }
            Some(Ok(Message::Text(text))) if text.starts_with("44") => {
                return Err(AgentError::Protocol(format!(
                    "authentication failed: {text}"
                )));
            }
            Some(Ok(message)) => {
                return Err(AgentError::Protocol(format!(
                    "unexpected auth response: {message:?}"
                )));
            }
            Some(Err(err)) => return Err(AgentError::Receive(err.to_string())),
            None => {
                return Err(AgentError::Receive(
                    "connection closed during auth".to_string(),
                ))
            }
        }

        self.command_listener_loop(writer, &mut reader)
            .await
            .map_err(|err| AgentError::Disconnected(err.to_string()))
    }

    async fn token_refresh_loop(
        server_url: String,
        short_token: Arc<RwLock<String>>,
        http_client: reqwest::Client,
    ) {
        let mut interval = tokio::time::interval(Duration::from_secs(TOKEN_REFRESH_INTERVAL_SECS));
        interval.tick().await; // skip first tick — don't refresh immediately on connect

        loop {
            interval.tick().await;
            let current = short_token.read().await.clone();
            if current.is_empty() {
                continue;
            }
            let url = format!("{}/agents/refresh-token", server_url.trim_end_matches('/'));
            match http_client
                .post(&url)
                .header("Authorization", format!("Bearer {current}"))
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    match resp.json::<serde_json::Value>().await {
                        Ok(body) => {
                            if let Some(new_token) = body.get("shortToken").and_then(|t| t.as_str())
                            {
                                *short_token.write().await = new_token.to_string();
                                info!("agent short token refreshed");
                            } else {
                                warn!("token refresh response missing shortToken field");
                            }
                        }
                        Err(err) => warn!(error = %err, "failed to parse token refresh response"),
                    }
                }
                Ok(resp) => warn!(status = %resp.status(), "token refresh request rejected"),
                Err(err) => warn!(error = %err, "token refresh request failed"),
            }
        }
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
        let heartbeat_task =
            tokio::spawn(async move { Self::heartbeat_loop(heartbeat_writer).await });
        tokio::pin!(heartbeat_task);

        let token_arc = Arc::clone(&self.short_token);
        let http_client = self.http_client.clone();
        let server_url = self.server_url.clone();
        let refresh_task = tokio::spawn(async move {
            Self::token_refresh_loop(server_url, token_arc, http_client).await;
        });
        tokio::pin!(refresh_task);

        loop {
            tokio::select! {
                heartbeat_result = &mut heartbeat_task => {
                    return match heartbeat_result {
                        Ok(Ok(())) => Ok(()),
                        Ok(Err(err)) => Err(err),
                        Err(err) => Err(AgentError::Send(err.to_string())),
                    };
                }
                _ = &mut refresh_task => {
                    // refresh loop never returns normally; log and continue
                    warn!("token refresh loop exited unexpectedly");
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
                let dispatch: DispatchPayload = serde_json::from_value(payload)
                    .map_err(|err| AgentError::Protocol(err.to_string()))?;

                if !verify_dispatch_sig(&self.signing_key, &dispatch) {
                    warn!(job_id = %dispatch.job_id, "dispatch rejected: invalid signature");
                    let packet = socketio_event_packet(
                        "command_result",
                        rejected_result(
                            &dispatch,
                            "INVALID_SIGNATURE",
                            "invalid dispatch signature",
                        ),
                    );
                    send_text(writer, packet).await?;
                    return Ok(());
                }

                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                let age_ms = now_ms.saturating_sub(dispatch.ts);
                let future_ms = dispatch.ts.saturating_sub(now_ms);
                if age_ms > DISPATCH_MAX_SKEW_MS || future_ms > DISPATCH_MAX_SKEW_MS {
                    warn!(job_id = %dispatch.job_id, age_ms, future_ms, "dispatch rejected: stale or future timestamp");
                    let packet = socketio_event_packet(
                        "command_result",
                        rejected_result(
                            &dispatch,
                            "STALE_TIMESTAMP",
                            "dispatch timestamp outside allowed skew",
                        ),
                    );
                    send_text(writer, packet).await?;
                    return Ok(());
                }

                if let Err((reason, message)) = validate_dispatch(&dispatch, &self.agent_id, now_ms)
                {
                    warn!(job_id = %dispatch.job_id, reason, "dispatch rejected: {message}");
                    let packet = socketio_event_packet(
                        "command_result",
                        rejected_result(&dispatch, reason, message),
                    );
                    send_text(writer, packet).await?;
                    return Ok(());
                }

                let replayed = {
                    let mut seen = self.seen_nonces.lock().unwrap();
                    if seen.contains(&dispatch.nonce) {
                        true
                    } else {
                        if seen.len() >= NONCE_SET_MAX_SIZE {
                            seen.clear();
                        }
                        seen.insert(dispatch.nonce.clone());
                        false
                    }
                };
                if replayed {
                    warn!(job_id = %dispatch.job_id, "dispatch rejected: replayed nonce");
                    let packet = socketio_event_packet(
                        "command_result",
                        rejected_result(&dispatch, "REPLAY_DETECTED", "replayed dispatch"),
                    );
                    send_text(writer, packet).await?;
                    return Ok(());
                }

                if dispatch.allowed_commands.is_empty()
                    || !dispatch
                        .allowed_commands
                        .iter()
                        .any(|p| matches_pattern(p, &dispatch.command))
                {
                    warn!(
                        job_id = %dispatch.job_id,
                        command = %dispatch.command,
                        "dispatch rejected: command not in allowlist"
                    );
                    let packet = socketio_event_packet(
                        "command_result",
                        rejected_result(
                            &dispatch,
                            "COMMAND_NOT_ALLOWED",
                            "command not in allowlist",
                        ),
                    );
                    send_text(writer, packet).await?;
                    return Ok(());
                }

                let command_payload = CommandPayload {
                    protocol_version: dispatch.protocol_version,
                    job_id: dispatch.job_id.clone(),
                    target_agent_id: dispatch.target_agent_id.clone(),
                    run_id: dispatch.run_id.clone(),
                    target_execution_id: dispatch.target_execution_id.clone(),
                    attempt_id: dispatch.attempt_id.clone(),
                    operation_id: dispatch.operation_id.clone(),
                    command: dispatch.command.clone(),
                    timeout_ms: dispatch.timeout_ms,
                    max_output_bytes: dispatch.max_output_bytes as usize,
                    sandbox_mode: self.sandbox_mode.clone(),
                };

                // Acknowledge receipt before spawning so the server can distinguish
                // "never received" from "received then crashed".
                let ack_packet = socketio_event_packet("job_ack", correlation_fields(&dispatch));
                send_text(writer, ack_packet).await?;

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

fn correlation_fields(payload: &DispatchPayload) -> Value {
    json!({
        "protocolVersion": payload.protocol_version,
        "jobId": payload.job_id,
        "targetAgentId": payload.target_agent_id,
        "runId": payload.run_id,
        "targetExecutionId": payload.target_execution_id,
        "attemptId": payload.attempt_id,
        "operationId": payload.operation_id,
    })
}

fn rejected_result(payload: &DispatchPayload, reason_code: &str, message: &str) -> Value {
    let mut result = correlation_fields(payload);
    if let Some(object) = result.as_object_mut() {
        object.insert("outcome".to_string(), json!("rejected"));
        object.insert("exitCode".to_string(), Value::Null);
        object.insert("reasonCode".to_string(), json!(reason_code));
        object.insert("stdout".to_string(), json!(""));
        object.insert("stderr".to_string(), json!(message));
        object.insert("stdoutTruncated".to_string(), json!(false));
        object.insert("stderrTruncated".to_string(), json!(false));
        object.insert("durationMs".to_string(), json!(0));
    }
    result
}

fn validate_dispatch(
    payload: &DispatchPayload,
    enrolled_agent_id: &str,
    now_ms: u64,
) -> Result<(), (&'static str, &'static str)> {
    if payload.protocol_version != 2 {
        return Err(("UNSUPPORTED_PROTOCOL", "protocolVersion must be 2"));
    }
    if payload.target_agent_id != enrolled_agent_id {
        return Err(("WRONG_TARGET", "dispatch target does not match this agent"));
    }
    if payload.org_id.is_empty() || payload.job_id.is_empty() {
        return Err((
            "INVALID_IDENTITY",
            "organization and job identities are required",
        ));
    }
    for id in [
        &payload.run_id,
        &payload.target_execution_id,
        &payload.attempt_id,
        &payload.operation_id,
        &payload.nonce,
    ] {
        if Uuid::parse_str(id).is_err() {
            return Err(("INVALID_IDENTITY", "execution identities must be UUIDs"));
        }
    }
    if payload.action_version.len() != 64
        || !payload
            .action_version
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err((
            "INVALID_ACTION_VERSION",
            "actionVersion must be a SHA-256 hex digest",
        ));
    }
    if !(100..=300_000).contains(&payload.timeout_ms) {
        return Err((
            "INVALID_TIMEOUT",
            "timeoutMs is outside the supported range",
        ));
    }
    if payload.start_before < now_ms {
        return Err((
            "START_DEADLINE_EXCEEDED",
            "dispatch start deadline has passed",
        ));
    }
    if payload.max_output_bytes == 0 || payload.max_output_bytes > MAX_OUTPUT_BYTES_PER_STREAM {
        return Err((
            "INVALID_OUTPUT_LIMIT",
            "maxOutputBytes is outside the supported range",
        ));
    }
    Ok(())
}

fn verify_dispatch_sig(key: &[u8], payload: &DispatchPayload) -> bool {
    if key.is_empty() {
        return false;
    }
    let msg = canonical_msg(payload);
    let Ok(sig_bytes) = hex::decode(&payload.sig) else {
        return false;
    };
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(msg.as_bytes());
    mac.verify_slice(&sig_bytes).is_ok()
}

fn canonical_msg(payload: &DispatchPayload) -> String {
    serde_json::to_string(&json!([
        payload.protocol_version,
        payload.org_id,
        payload.job_id,
        payload.target_agent_id,
        payload.run_id,
        payload.target_execution_id,
        payload.attempt_id,
        payload.operation_id,
        payload.action_version,
        payload.command,
        payload.allowed_commands,
        payload.timeout_ms,
        payload.start_before,
        payload.max_output_bytes,
        payload.nonce,
        payload.ts,
    ]))
    .unwrap_or_default()
}

fn matches_pattern(pattern: &str, command: &str) -> bool {
    pattern == command
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> Vec<u8> {
        hex::decode("deadbeefdeadbeefdeadbeefdeadbeef").unwrap()
    }

    fn sign(key: &[u8], payload: &DispatchPayload) -> String {
        let msg = canonical_msg(payload);
        let mut mac = HmacSha256::new_from_slice(key).unwrap();
        mac.update(msg.as_bytes());
        mac.finalize()
            .into_bytes()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    fn make_payload() -> DispatchPayload {
        let mut payload = DispatchPayload {
            protocol_version: 2,
            org_id: "org-1".to_string(),
            job_id: "job-1".to_string(),
            target_agent_id: "agent-1".to_string(),
            run_id: "11111111-1111-4111-8111-111111111111".to_string(),
            target_execution_id: "22222222-2222-4222-8222-222222222222".to_string(),
            attempt_id: "33333333-3333-4333-8333-333333333333".to_string(),
            operation_id: "44444444-4444-4444-8444-444444444444".to_string(),
            action_version: "a".repeat(64),
            command: "echo \"héllo\"\n".to_string(),
            nonce: "55555555-5555-4555-8555-555555555555".to_string(),
            ts: 1_700_000_000_000,
            sig: String::new(),
            allowed_commands: vec!["echo *".to_string()],
            timeout_ms: 30_000,
            start_before: 1_700_000_060_000,
            max_output_bytes: 65_536,
        };
        payload.sig = sign(&test_key(), &payload);
        payload
    }

    #[test]
    fn canonical_v2_fixture_is_stable() {
        let payload = make_payload();
        assert_eq!(
            canonical_msg(&payload),
            "[2,\"org-1\",\"job-1\",\"agent-1\",\"11111111-1111-4111-8111-111111111111\",\"22222222-2222-4222-8222-222222222222\",\"33333333-3333-4333-8333-333333333333\",\"44444444-4444-4444-8444-444444444444\",\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"echo \\\"héllo\\\"\\n\",[\"echo *\"],30000,1700000060000,65536,\"55555555-5555-4555-8555-555555555555\",1700000000000]"
        );
    }

    #[test]
    fn verify_dispatch_sig_accepts_valid_v2_envelope() {
        let key = test_key();
        let payload = make_payload();
        assert_eq!(
            payload.sig,
            "4b80d69dee74e0d4d5af0de88ed3422119fcdde60f2a2090a314eca32d522af5"
        );
        assert!(verify_dispatch_sig(&key, &payload));
    }

    #[test]
    fn verify_dispatch_sig_binds_target_and_limits() {
        let key = test_key();
        let mut payload = make_payload();
        payload.protocol_version = 1;
        assert!(!verify_dispatch_sig(&key, &payload));
        let mut payload = make_payload();
        payload.target_agent_id = "agent-2".to_string();
        assert!(!verify_dispatch_sig(&key, &payload));
        let mut payload = make_payload();
        payload.timeout_ms += 1;
        assert!(!verify_dispatch_sig(&key, &payload));
        let mut payload = make_payload();
        payload.max_output_bytes -= 1;
        assert!(!verify_dispatch_sig(&key, &payload));
    }

    #[test]
    fn verify_dispatch_sig_rejects_bad_sig_string() {
        let key = test_key();
        let mut payload = make_payload();
        payload.sig = "deadbeef".to_string();
        assert!(!verify_dispatch_sig(&key, &payload));
    }

    #[test]
    fn validate_dispatch_enforces_stable_target_deadline_and_limits() {
        let mut payload = make_payload();
        assert!(validate_dispatch(&payload, "agent-1", payload.ts).is_ok());
        assert_eq!(
            validate_dispatch(&payload, "agent-2", payload.ts)
                .unwrap_err()
                .0,
            "WRONG_TARGET"
        );
        payload.start_before = payload.ts - 1;
        assert_eq!(
            validate_dispatch(&payload, "agent-1", payload.ts)
                .unwrap_err()
                .0,
            "START_DEADLINE_EXCEEDED"
        );
        payload.start_before = payload.ts + 1;
        payload.max_output_bytes = 65_537;
        assert_eq!(
            validate_dispatch(&payload, "agent-1", payload.ts)
                .unwrap_err()
                .0,
            "INVALID_OUTPUT_LIMIT"
        );
    }

    #[test]
    fn matches_pattern_exact_match() {
        assert!(matches_pattern("echo hello", "echo hello"));
        assert!(!matches_pattern("echo hello", "echo world"));
    }

    #[test]
    fn matches_pattern_glob_prefix() {
        assert!(!matches_pattern("echo *", "echo hello"));
        assert!(!matches_pattern("echo *", "echo world"));
        assert!(!matches_pattern("echo *", "ls -la"));
        assert!(!matches_pattern("git *", "git commit -m msg"));
    }

    #[test]
    fn matches_pattern_wildcard_matches_all() {
        assert!(!matches_pattern("*", "any command"));
        assert!(!matches_pattern("*", ""));
    }

    #[test]
    fn empty_allowlist_does_not_approve_a_command() {
        let patterns: Vec<String> = Vec::new();
        assert!(!patterns
            .iter()
            .any(|pattern| matches_pattern(pattern, "echo hello")));
    }
}
