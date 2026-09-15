use crate::sandbox::{build_sandboxed_command, SandboxMode};
use serde::Serialize;
use std::process::Stdio;
use std::time::Instant;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

const OUTPUT_DRAIN_GRACE: Duration = Duration::from_secs(1);

#[derive(Debug, Clone)]
pub struct CommandPayload {
    pub protocol_version: u8,
    pub job_id: String,
    pub target_agent_id: String,
    pub run_id: String,
    pub target_execution_id: String,
    pub attempt_id: String,
    pub operation_id: String,
    pub command: String,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
    /// Sandbox mode to apply when executing this command. Copied from
    /// `AgentConnection::sandbox_mode` at dispatch time.
    pub sandbox_mode: SandboxMode,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionOutcome {
    Completed,
    Rejected,
    TimedOut,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u8,
    #[serde(rename = "jobId")]
    pub job_id: String,
    #[serde(rename = "targetAgentId")]
    pub target_agent_id: String,
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(rename = "targetExecutionId")]
    pub target_execution_id: String,
    #[serde(rename = "attemptId")]
    pub attempt_id: String,
    #[serde(rename = "operationId")]
    pub operation_id: String,
    pub outcome: ExecutionOutcome,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "reasonCode")]
    pub reason_code: Option<String>,
    pub stdout: String,
    pub stderr: String,
    #[serde(rename = "stdoutTruncated")]
    pub stdout_truncated: bool,
    #[serde(rename = "stderrTruncated")]
    pub stderr_truncated: bool,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
}

struct ExecutionReport {
    outcome: ExecutionOutcome,
    exit_code: Option<i32>,
    reason_code: Option<&'static str>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    stdout_truncated: bool,
    stderr_truncated: bool,
}

impl CommandResult {
    fn from_payload(
        payload: &CommandPayload,
        report: ExecutionReport,
        started_at: Instant,
    ) -> Self {
        Self {
            protocol_version: payload.protocol_version,
            job_id: payload.job_id.clone(),
            target_agent_id: payload.target_agent_id.clone(),
            run_id: payload.run_id.clone(),
            target_execution_id: payload.target_execution_id.clone(),
            attempt_id: payload.attempt_id.clone(),
            operation_id: payload.operation_id.clone(),
            outcome: report.outcome,
            exit_code: report.exit_code,
            reason_code: report.reason_code.map(str::to_string),
            stdout: String::from_utf8_lossy(&report.stdout).to_string(),
            stderr: String::from_utf8_lossy(&report.stderr).to_string(),
            stdout_truncated: report.stdout_truncated,
            stderr_truncated: report.stderr_truncated,
            duration_ms: started_at.elapsed().as_millis() as u64,
        }
    }
}

async fn read_bounded<R: AsyncRead + Unpin>(mut reader: R, limit: usize) -> (Vec<u8>, bool) {
    let mut stored = Vec::with_capacity(limit.min(8 * 1024));
    let mut chunk = [0_u8; 8 * 1024];
    let mut truncated = false;

    loop {
        match reader.read(&mut chunk).await {
            Ok(0) => break,
            Ok(count) => {
                let remaining = limit.saturating_sub(stored.len());
                let keep = remaining.min(count);
                stored.extend_from_slice(&chunk[..keep]);
                truncated |= keep < count;
            }
            Err(_) => {
                truncated = true;
                break;
            }
        }
    }

    (stored, truncated)
}

async fn collect_output(task: &mut JoinHandle<(Vec<u8>, bool)>) -> (Vec<u8>, bool) {
    match timeout(OUTPUT_DRAIN_GRACE, &mut *task).await {
        Ok(Ok(output)) => output,
        Ok(Err(_)) => (Vec::new(), true),
        Err(_) => {
            task.abort();
            (Vec::new(), true)
        }
    }
}

pub async fn execute_command(payload: CommandPayload) -> CommandResult {
    let started_at = Instant::now();

    let mut child = match build_sandboxed_command(&payload.command, &payload.sandbox_mode)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            return CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::Rejected,
                    exit_code: None,
                    reason_code: Some("SPAWN_FAILED"),
                    stdout: Vec::new(),
                    stderr: err.to_string().into_bytes(),
                    stdout_truncated: false,
                    stderr_truncated: false,
                },
                started_at,
            );
        }
    };

    let output_limit = payload.max_output_bytes;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let mut stdout_task = tokio::spawn(async move {
        match stdout {
            Some(stdout) => read_bounded(stdout, output_limit).await,
            None => (Vec::new(), false),
        }
    });
    let mut stderr_task = tokio::spawn(async move {
        match stderr {
            Some(stderr) => read_bounded(stderr, output_limit).await,
            None => (Vec::new(), false),
        }
    });

    let wait_result = timeout(Duration::from_millis(payload.timeout_ms), child.wait()).await;

    match wait_result {
        Ok(Ok(status)) => {
            let (stdout, stdout_truncated) = collect_output(&mut stdout_task).await;
            let (stderr, stderr_truncated) = collect_output(&mut stderr_task).await;
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::Completed,
                    exit_code: Some(status.code().unwrap_or(-1)),
                    reason_code: None,
                    stdout,
                    stderr,
                    stdout_truncated,
                    stderr_truncated,
                },
                started_at,
            )
        }
        Ok(Err(err)) => {
            stdout_task.abort();
            stderr_task.abort();
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::Unknown,
                    exit_code: None,
                    reason_code: Some("WAIT_FAILED"),
                    stdout: Vec::new(),
                    stderr: err.to_string().into_bytes(),
                    stdout_truncated: true,
                    stderr_truncated: true,
                },
                started_at,
            )
        }
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            let (stdout, stdout_truncated) = collect_output(&mut stdout_task).await;
            let (stderr, stderr_truncated) = collect_output(&mut stderr_task).await;
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::TimedOut,
                    exit_code: None,
                    reason_code: Some("EXECUTION_DEADLINE_EXCEEDED"),
                    stdout,
                    stderr,
                    stdout_truncated,
                    stderr_truncated,
                },
                started_at,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{execute_command, CommandPayload, ExecutionOutcome};
    use crate::sandbox::SandboxMode;

    fn payload(command: &str, timeout_ms: u64, max_output_bytes: usize) -> CommandPayload {
        CommandPayload {
            protocol_version: 2,
            job_id: "job-test".to_string(),
            target_agent_id: "agent-test".to_string(),
            run_id: "11111111-1111-4111-8111-111111111111".to_string(),
            target_execution_id: "22222222-2222-4222-8222-222222222222".to_string(),
            attempt_id: "33333333-3333-4333-8333-333333333333".to_string(),
            operation_id: "44444444-4444-4444-8444-444444444444".to_string(),
            command: command.to_string(),
            timeout_ms,
            max_output_bytes,
            sandbox_mode: SandboxMode::None,
        }
    }

    #[tokio::test]
    async fn echo_hello_returns_success_with_correlations() {
        let result = execute_command(payload("echo hello", 5_000, 65_536)).await;
        assert_eq!(result.outcome, ExecutionOutcome::Completed);
        assert_eq!(result.exit_code, Some(0));
        assert_eq!(result.run_id, "11111111-1111-4111-8111-111111111111");
        assert!(result.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn exit_one_is_completed_with_nonzero_exit() {
        let result = execute_command(payload("exit 1", 5_000, 65_536)).await;
        assert_eq!(result.outcome, ExecutionOutcome::Completed);
        assert_eq!(result.exit_code, Some(1));
    }

    #[tokio::test]
    async fn long_running_command_times_out_without_claiming_exit() {
        let command = if cfg!(target_os = "windows") {
            "ping 127.0.0.1 -n 3 > nul"
        } else {
            "sleep 2"
        };
        let result = execute_command(payload(command, 100, 65_536)).await;
        assert_eq!(result.outcome, ExecutionOutcome::TimedOut);
        assert_eq!(result.exit_code, None);
        assert_eq!(
            result.reason_code.as_deref(),
            Some("EXECUTION_DEADLINE_EXCEEDED")
        );
    }

    #[tokio::test]
    async fn output_is_bounded_and_marked_truncated() {
        let command = if cfg!(target_os = "windows") {
            "for /L %i in (1,1,200) do @echo 0123456789"
        } else {
            "yes 0123456789 | head -n 200"
        };
        let result = execute_command(payload(command, 5_000, 64)).await;
        assert!(result.stdout.len() <= 64);
        assert!(result.stdout_truncated);
    }

    #[tokio::test]
    async fn nonexistent_command_is_not_success() {
        let result = execute_command(payload("cat nonexistent_file", 5_000, 65_536)).await;
        assert_ne!(result.exit_code, Some(0));
    }
}
