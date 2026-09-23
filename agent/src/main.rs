mod connection;
mod execution;
mod journal;
mod sandbox;
mod telemetry;

use connection::AgentConnection;
use dotenv::dotenv;
use journal::AttemptJournal;
use sandbox::{reconcile_containment, SandboxMode};
use std::{env, path::PathBuf, sync::Arc};
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

    let release_id = env::var("AXON_RELEASE_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    let journal_dir = env::var("AXON_AGENT_JOURNAL_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data/attempt-journal"));
    let journal_max_entries = env::var("AXON_AGENT_JOURNAL_MAX_ENTRIES")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(10_000);
    let journal = match AttemptJournal::open(&journal_dir, journal_max_entries) {
        Ok(journal) => Arc::new(journal),
        Err(err) => {
            error!(path = %journal_dir.display(), error = %err, "failed to open attempt journal");
            std::process::exit(1);
        }
    };
    tracing::info!(
        path = %journal_dir.display(),
        max_entries = journal_max_entries,
        release_id = %release_id,
        "attempt journal ready"
    );

    let sandbox_mode =
        SandboxMode::from_env(journal_dir.clone(), agent_id.clone(), release_id.clone());
    if !sandbox_mode.is_none() {
        tracing::info!(mode = ?sandbox_mode, "sandbox mode enabled for dispatched commands");
    }
    let recovered = match reconcile_containment(&sandbox_mode).await {
        Ok(count) => count,
        Err(err) => {
            error!(error = %err, "Docker containment startup reconciliation failed");
            std::process::exit(1);
        }
    };
    tracing::info!(
        recovered,
        "Docker containment startup reconciliation complete"
    );

    let connection = AgentConnection::new(
        server_url,
        agent_id,
        api_key,
        short_token,
        1_000,
        30_000,
        signing_key,
        sandbox_mode,
        release_id,
        journal,
    );

    connection.run_forever().await;
}
