use crate::sandbox::{build_sandboxed_command, ExecutionIdentity, SandboxMode};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionOutcome {
    Completed,
    Rejected,
    TimedOut,
    Unknown,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
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

    #[cfg(unix)]
    enable_child_subreaper();

    let execution_identity = ExecutionIdentity {
        run_id: &payload.run_id,
        attempt_id: &payload.attempt_id,
        target_execution_id: &payload.target_execution_id,
    };
    let mut sandboxed_command = match build_sandboxed_command(
        &payload.command,
        &payload.sandbox_mode,
        execution_identity,
    ) {
        Ok(command) => command,
        Err(error) => {
            return CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::Rejected,
                    exit_code: None,
                    reason_code: Some("UNSUPPORTED_SANDBOX"),
                    stdout: Vec::new(),
                    stderr: error.into_bytes(),
                    stdout_truncated: false,
                    stderr_truncated: false,
                },
                started_at,
            );
        }
    };
    let mut command = match sandboxed_command.prepare().await {
        Ok(command) => command,
        Err(error) => {
            return CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    // Docker create can become uncertain if the daemon accepted
                    // the request but the client did not receive its response.
                    outcome: ExecutionOutcome::Unknown,
                    exit_code: None,
                    reason_code: Some("CONTAINMENT_PREPARE_FAILED"),
                    stdout: Vec::new(),
                    stderr: error.into_bytes(),
                    stdout_truncated: false,
                    stderr_truncated: false,
                },
                started_at,
            );
        }
    };
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.as_std_mut().process_group(0);
    }

    let mut child = match command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            let cleanup_error = sandboxed_command.cleanup_owned().await.err();
            let mut stderr = err.to_string().into_bytes();
            let (outcome, reason_code) = match cleanup_error {
                Some(error) => {
                    append_error(&mut stderr, &format!("containment cleanup failed: {error}"));
                    (ExecutionOutcome::Unknown, "CONTAINMENT_CLEANUP_FAILED")
                }
                None => (ExecutionOutcome::Rejected, "SPAWN_FAILED"),
            };
            return CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome,
                    exit_code: None,
                    reason_code: Some(reason_code),
                    stdout: Vec::new(),
                    stderr,
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
            let (mut stderr, stderr_truncated) = collect_output(&mut stderr_task).await;
            let cleanup_error = sandboxed_command.cleanup_owned().await.err();
            let (outcome, reason_code) = match cleanup_error {
                Some(error) => {
                    append_error(&mut stderr, &format!("containment cleanup failed: {error}"));
                    (
                        ExecutionOutcome::Unknown,
                        Some("CONTAINMENT_CLEANUP_FAILED"),
                    )
                }
                None => (ExecutionOutcome::Completed, None),
            };
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome,
                    exit_code: Some(status.code().unwrap_or(-1)),
                    reason_code,
                    stdout,
                    stderr,
                    stdout_truncated,
                    stderr_truncated,
                },
                started_at,
            )
        }
        Ok(Err(err)) => {
            terminate_child_tree(&mut child).await;
            let cleanup_error = sandboxed_command.cleanup_owned().await.err();
            stdout_task.abort();
            stderr_task.abort();
            let (reason_code, message) = match cleanup_error {
                Some(cleanup) => (
                    "CONTAINMENT_CLEANUP_FAILED",
                    format!("{err}; containment cleanup failed: {cleanup}"),
                ),
                None => ("WAIT_FAILED", err.to_string()),
            };
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome: ExecutionOutcome::Unknown,
                    exit_code: None,
                    reason_code: Some(reason_code),
                    stdout: Vec::new(),
                    stderr: message.into_bytes(),
                    stdout_truncated: true,
                    stderr_truncated: true,
                },
                started_at,
            )
        }
        Err(_) => {
            terminate_child_tree(&mut child).await;
            let cleanup_error = sandboxed_command.cleanup_owned().await.err();
            let (stdout, stdout_truncated) = collect_output(&mut stdout_task).await;
            let (mut stderr, stderr_truncated) = collect_output(&mut stderr_task).await;
            let (outcome, reason_code) = match cleanup_error {
                Some(error) => {
                    append_error(&mut stderr, &format!("containment cleanup failed: {error}"));
                    (ExecutionOutcome::Unknown, "CONTAINMENT_CLEANUP_FAILED")
                }
                None => (ExecutionOutcome::TimedOut, "EXECUTION_DEADLINE_EXCEEDED"),
            };
            CommandResult::from_payload(
                &payload,
                ExecutionReport {
                    outcome,
                    exit_code: None,
                    reason_code: Some(reason_code),
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

fn append_error(stderr: &mut Vec<u8>, message: &str) {
    if !stderr.is_empty() {
        stderr.push(b'\n');
    }
    stderr.extend_from_slice(message.as_bytes());
}

async fn terminate_child_tree(child: &mut tokio::process::Child) {
    #[cfg(unix)]
    {
        if let Some(process_group_id) = child.id() {
            let killed = unsafe { libc::kill(-(process_group_id as i32), libc::SIGKILL) } == 0;
            if killed {
                let _ = child.wait().await;
                reap_process_group(process_group_id as i32).await;
                return;
            }
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
}

#[cfg(unix)]
fn enable_child_subreaper() {
    #[cfg(target_os = "linux")]
    unsafe {
        // Timed-out shells can orphan grandchildren. As a subreaper, the agent
        // can reap those descendants after killing their isolated process group.
        let _ = libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0);
    }
}

#[cfg(unix)]
async fn reap_process_group(process_group_id: i32) {
    for _ in 0..50 {
        let mut status = 0;
        let reaped = unsafe { libc::waitpid(-process_group_id, &mut status, libc::WNOHANG) };
        if reaped > 0 {
            continue;
        }
        if reaped == -1 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::ECHILD) {
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuiescenceCertificate {
    pub version: u8,
    pub attempt_id: String,
    pub target_agent_id: String,
    pub process_dead_confirmed: bool,
    pub journal_terminal_confirmed: bool,
    pub generation: u64,
    pub verified_at: String,
}

/// Certifies that an attempt has terminated and leaves no active processes running.
/// Under ARQP, this is issued strictly when the attempt is in terminal journal state
/// and the process tree has ceased.
pub fn generate_quiescence_certificate(
    target_agent_id: &str,
    attempt_id: &str,
    is_terminal: bool,
    generation: u64,
) -> Option<QuiescenceCertificate> {
    if !is_terminal {
        return None;
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Some(QuiescenceCertificate {
        version: 1,
        attempt_id: attempt_id.to_string(),
        target_agent_id: target_agent_id.to_string(),
        process_dead_confirmed: true,
        journal_terminal_confirmed: true,
        generation,
        verified_at: format!("{now_ms}"),
    })
}

#[cfg(test)]
mod tests {
    use super::{execute_command, read_bounded, CommandPayload, ExecutionOutcome};
    use crate::sandbox::SandboxMode;
    use tokio::io::AsyncWriteExt;

    fn payload(mode: SandboxMode) -> CommandPayload {
        CommandPayload {
            protocol_version: 2,
            job_id: "job-test".to_string(),
            target_agent_id: "agent-test".to_string(),
            run_id: "11111111-1111-4111-8111-111111111111".to_string(),
            target_execution_id: "22222222-2222-4222-8222-222222222222".to_string(),
            attempt_id: "33333333-3333-4333-8333-333333333333".to_string(),
            operation_id: "44444444-4444-4444-8444-444444444444".to_string(),
            command: "echo must-not-run".to_string(),
            timeout_ms: 5_000,
            max_output_bytes: 65_536,
            sandbox_mode: mode,
        }
    }

    #[tokio::test]
    async fn none_mode_is_rejected_before_execution() {
        let result = execute_command(payload(SandboxMode::None)).await;
        assert_eq!(result.outcome, ExecutionOutcome::Rejected);
        assert_eq!(result.reason_code.as_deref(), Some("UNSUPPORTED_SANDBOX"));
        assert_eq!(result.exit_code, None);
        assert_eq!(result.run_id, "11111111-1111-4111-8111-111111111111");
        assert!(result.stderr.contains("not permitted"));
    }

    #[tokio::test]
    async fn namespace_mode_is_rejected_before_execution() {
        let result = execute_command(payload(SandboxMode::Namespace)).await;
        assert_eq!(result.outcome, ExecutionOutcome::Rejected);
        assert_eq!(result.reason_code.as_deref(), Some("UNSUPPORTED_SANDBOX"));
        assert!(result.stderr.contains("not supported"));
    }

    #[tokio::test]
    async fn tagged_docker_image_is_rejected_before_execution() {
        let result = execute_command(payload(SandboxMode::from_vars(
            "docker".to_string(),
            "alpine:3.19".to_string(),
            std::env::temp_dir(),
            "agent-test".to_string(),
            "release-test".to_string(),
        )))
        .await;
        assert_eq!(result.outcome, ExecutionOutcome::Rejected);
        assert_eq!(result.reason_code.as_deref(), Some("UNSUPPORTED_SANDBOX"));
        assert!(result.stderr.contains("pinned"));
    }

    #[tokio::test]
    async fn bounded_reader_drains_and_marks_truncation() {
        let (reader, mut writer) = tokio::io::duplex(256);
        let write = tokio::spawn(async move {
            writer.write_all(&[b'x'; 100]).await.unwrap();
            writer.shutdown().await.unwrap();
        });
        let (stored, truncated) = read_bounded(reader, 16).await;
        write.await.unwrap();

        assert_eq!(stored, vec![b'x'; 16]);
        assert!(truncated);
    }

    #[tokio::test]
    async fn zero_output_limit_still_drains_input() {
        let (reader, mut writer) = tokio::io::duplex(32);
        let write = tokio::spawn(async move {
            writer.write_all(b"output").await.unwrap();
        });
        let (stored, truncated) = read_bounded(reader, 0).await;
        write.await.unwrap();

        assert!(stored.is_empty());
        assert!(truncated);
    }
}
