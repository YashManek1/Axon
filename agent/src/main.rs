mod connection;
mod execution;
mod telemetry;

use connection::AgentConnection;
use dotenv::dotenv;
use std::env;
use tracing::error;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    let server_url = match env::var("SERVER_URL") {
        Ok(value) => value,
        Err(_) => {
            error!("SERVER_URL must be set");
            std::process::exit(1);
        }
    };
    let agent_id = match env::var("AGENT_ID") {
        Ok(value) => value,
        Err(_) => {
            error!("AGENT_ID must be set");
            std::process::exit(1);
        }
    };
    let api_key = match env::var("AGENT_API_KEY") {
        Ok(value) => value,
        Err(_) => {
            error!("AGENT_API_KEY must be set");
            std::process::exit(1);
        }
    };

    let connection = AgentConnection {
        server_url,
        agent_id,
        api_key,
        reconnect_delay_ms: 1_000,
        max_reconnect_delay_ms: 30_000,
    };

    connection.run_forever().await;
}
