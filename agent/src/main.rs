mod connection;
mod execution;
mod sandbox;
mod telemetry;

use connection::AgentConnection;
use sandbox::SandboxMode;
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

    let signing_key = match env::var("DISPATCH_SIGNING_KEY") {
        Ok(hex_str) => {
            if hex_str.len() < 32 {
                error!(
                    len = hex_str.len(),
                    "DISPATCH_SIGNING_KEY must be at least 32 hex characters"
                );
                std::process::exit(1);
            }
            match hex::decode(&hex_str) {
                Ok(bytes) => bytes,
                Err(err) => {
                    error!(error = %err, "DISPATCH_SIGNING_KEY must be valid hexadecimal");
                    std::process::exit(1);
                }
            }
        }
        Err(_) => {
            error!("DISPATCH_SIGNING_KEY must be set");
            std::process::exit(1);
        }
    };

    let short_token = env::var("AGENT_SHORT_TOKEN").unwrap_or_default();
    if short_token.is_empty() {
        tracing::warn!("AGENT_SHORT_TOKEN not set — using AGENT_API_KEY for bootstrap (set after registration)");
    }

    let sandbox_mode = SandboxMode::from_env();
    if !sandbox_mode.is_none() {
        tracing::info!(mode = ?sandbox_mode, "sandbox mode enabled for dispatched commands");
    }

    let connection = AgentConnection::new(
        server_url,
        agent_id,
        api_key,
        short_token,
        1_000,
        30_000,
        signing_key,
        sandbox_mode,
    );

    connection.run_forever().await;
}
