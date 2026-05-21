use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Debug, Clone, Deserialize)]
pub struct CommandPayload {
    #[serde(rename = "jobId", alias = "job_id")]
    pub job_id: String,
    pub command: String,
    #[serde(rename = "timeoutMs", alias = "timeout_ms")]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandResult {
    #[serde(rename = "jobId")]
    pub job_id: String,
    pub stdout: String,
    pub stderr: String,
    #[serde(rename = "exitCode")]
    pub exit_code: i32,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

pub async fn execute_command(payload: CommandPayload) -> CommandResult {
    let started_at = Instant::now();
    let timeout_ms = payload.timeout_ms.unwrap_or(30_000);
    let job_id = payload.job_id.clone();

    let (shell, arg) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };

    let mut child = match Command::new(shell)
        .arg(arg)
        .arg(&payload.command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            return CommandResult {
                job_id,
                stdout: String::new(),
                stderr: err.to_string(),
                exit_code: -1,
                duration_ms: started_at.elapsed().as_millis() as u64,
            };
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stdout) = stdout {
            let _ = stdout.read_to_end(&mut buffer).await;
        }
        buffer
    });
    let stderr_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_end(&mut buffer).await;
        }
        buffer
    });

    let wait_result = timeout(Duration::from_millis(timeout_ms), child.wait()).await;

    match wait_result {
        Ok(Ok(status)) => {
            let stdout = stdout_task.await.unwrap_or_default();
            let stderr = stderr_task.await.unwrap_or_default();

            CommandResult {
                job_id,
                stdout: String::from_utf8_lossy(&stdout).to_string(),
                stderr: String::from_utf8_lossy(&stderr).to_string(),
                exit_code: status.code().unwrap_or(-1),
                duration_ms: started_at.elapsed().as_millis() as u64,
            }
        }
        Ok(Err(err)) => CommandResult {
            job_id,
            stdout: String::new(),
            stderr: err.to_string(),
            exit_code: -1,
            duration_ms: started_at.elapsed().as_millis() as u64,
        },
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            stdout_task.abort();
            stderr_task.abort();
            CommandResult {
                job_id,
                stdout: String::new(),
                stderr: "TIMEOUT".to_string(),
                exit_code: -1,
                duration_ms: started_at.elapsed().as_millis() as u64,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{execute_command, CommandPayload};

    #[tokio::test]
    async fn echo_hello_returns_success() {
        let result = execute_command(CommandPayload {
            job_id: "job-echo".to_string(),
            command: "echo hello".to_string(),
            timeout_ms: Some(5_000),
        })
        .await;

        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn exit_one_returns_exit_code_one() {
        let result = execute_command(CommandPayload {
            job_id: "job-exit".to_string(),
            command: "exit 1".to_string(),
            timeout_ms: Some(5_000),
        })
        .await;

        assert_eq!(result.exit_code, 1);
    }

    #[tokio::test]
    async fn long_running_command_times_out() {
        let command = if cfg!(target_os = "windows") {
            "ping 127.0.0.1 -n 3 > nul"
        } else {
            "sleep 2"
        };

        let result = execute_command(CommandPayload {
            job_id: "job-timeout".to_string(),
            command: command.to_string(),
            timeout_ms: Some(100),
        })
        .await;

        assert_eq!(result.exit_code, -1);
        assert_eq!(result.stderr, "TIMEOUT");
    }

    #[tokio::test]
    async fn nonexistent_file_returns_stderr() {
        let result = execute_command(CommandPayload {
            job_id: "job-cat".to_string(),
            command: "cat nonexistent_file".to_string(),
            timeout_ms: Some(5_000),
        })
        .await;

        assert_ne!(result.exit_code, 0);
        assert!(!result.stderr.is_empty());
    }
}
