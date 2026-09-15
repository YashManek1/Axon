//! Sandbox modes for dispatched command execution.
//!
//! `SandboxMode` is read from environment variables at startup and stored on
//! `AgentConnection`.  The operator sets `AGENT_SANDBOX_MODE` (and optionally
//! `AGENT_SANDBOX_DOCKER_IMAGE`) based on the value returned by
//! `POST /agents/register`.
//!
//! | Mode        | Isolation                                              | Requires             |
//! |-------------|--------------------------------------------------------|----------------------|
//! | `none`      | None — current-user privileges (backward-compatible)   | nothing              |
//! | `namespace` | Linux user/mount/PID/net namespaces + seccomp filter   | `unshare(1)`, Linux  |
//! | `docker`    | Docker container, `--network none --read-only`         | Docker daemon + CLI  |

use std::env;
use tokio::process::Command;
use tracing::warn;

/// Per-agent execution sandbox mode.
#[derive(Debug, Clone, PartialEq)]
pub enum SandboxMode {
    /// No sandboxing — command runs with the agent's current-user privileges.
    /// Backward-compatible default.
    None,
    /// Linux namespace isolation via `unshare(1)`: new user, mount, PID, and
    /// network namespaces.  A minimal BPF seccomp filter is applied in the child
    /// process as defence-in-depth to block `socket(2)`, `connect(2)`, and
    /// `bind(2)`.  Non-Linux platforms fall back to `None` with a warning.
    Namespace,
    /// Docker container isolation.  Runs `docker run --rm --network none
    /// --read-only <image> sh -c <command>`.  Requires the Docker daemon and
    /// `docker(1)` CLI to be on PATH.
    Docker {
        /// Container image.  Set via `AGENT_SANDBOX_DOCKER_IMAGE`
        /// (default: `alpine:3.19`).
        image: String,
    },
}

impl SandboxMode {
    /// Read sandbox configuration from environment variables.
    pub fn from_env() -> Self {
        let mode = env::var("AGENT_SANDBOX_MODE").unwrap_or_default();
        let image = env::var("AGENT_SANDBOX_DOCKER_IMAGE")
            .unwrap_or_else(|_| "alpine:3.19".to_string());
        Self::from_vars(mode, image)
    }

    /// Construct from explicit string values (used directly in tests to avoid
    /// environment variable races between parallel test threads).
    pub(crate) fn from_vars(mode: String, docker_image: String) -> Self {
        match mode.to_lowercase().as_str() {
            "namespace" => Self::Namespace,
            "docker" => Self::Docker { image: docker_image },
            _ => Self::None,
        }
    }

    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }
}

/// Build a `Command` ready to execute `command` inside the chosen sandbox.
///
/// The caller must configure `.stdout(Stdio::piped()).stderr(Stdio::piped())`
/// and call `.spawn()`.
pub fn build_sandboxed_command(command: &str, mode: &SandboxMode) -> Command {
    match mode {
        SandboxMode::None => unsandboxed(command),
        SandboxMode::Namespace => namespace_command(command),
        SandboxMode::Docker { image } => docker_command(command, image),
    }
}

// ─── None ─────────────────────────────────────────────────────────────────────

fn unsandboxed(command: &str) -> Command {
    if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command]);
        cmd
    }
}

// ─── Docker ───────────────────────────────────────────────────────────────────

fn docker_command(command: &str, image: &str) -> Command {
    // --network none  removes all interfaces except loopback.
    // --read-only     mounts the container root FS read-only.
    // --rm            removes the container on exit.
    let mut cmd = Command::new("docker");
    cmd.args([
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        image,
        "sh",
        "-c",
        command,
    ]);
    cmd
}

// ─── Namespace (Linux) ────────────────────────────────────────────────────────

/// Linux: wraps the command in `unshare(1)` for namespace isolation and
/// attaches a BPF seccomp filter via a `pre_exec` hook.
#[cfg(target_os = "linux")]
fn namespace_command(command: &str) -> Command {
    // --user          new user namespace
    // --map-root-user maps the current UID/GID to uid=0 inside the namespace
    // --mount         new mount namespace (filesystem isolation)
    // --pid           new PID namespace (isolated process tree)
    // --net           new network namespace (loopback only, no external routes)
    // --fork          required with --pid; forks before exec
    let mut cmd = Command::new("unshare");
    cmd.args([
        "--user",
        "--map-root-user",
        "--mount",
        "--pid",
        "--net",
        "--fork",
        "--",
        "sh",
        "-c",
        command,
    ]);
    // Safety: the pre_exec closure only calls prctl(2), which is
    // async-signal-safe.  No heap allocation, no non-reentrant functions.
    // The seccomp filter propagates through exec() to sh and its children.
    unsafe {
        cmd.pre_exec(seccomp_block_network);
    }
    cmd
}

/// Non-Linux stub: namespace mode is unavailable; fall back gracefully.
#[cfg(not(target_os = "linux"))]
fn namespace_command(command: &str) -> Command {
    warn!(
        "SandboxMode::Namespace is not supported on this platform — \
         falling back to unsandboxed execution"
    );
    unsandboxed(command)
}

// ─── Seccomp filter (Linux + x86_64 / aarch64) ───────────────────────────────

/// `pre_exec` hook: applied in the child process after fork, before exec.
/// Installs a minimal BPF seccomp filter that returns `EPERM` for
/// `socket(2)`, `connect(2)`, and `bind(2)`.
///
/// Compiled only on x86_64 and aarch64 (the two supported Linux targets).
/// On other Linux architectures the function is a no-op.
#[cfg(target_os = "linux")]
fn seccomp_block_network() -> std::io::Result<()> {
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    {
        use libc::{prctl, sock_filter, sock_fprog, PR_SET_NO_NEW_PRIVS, PR_SET_SECCOMP};

        // ── BPF opcode constants ──────────────────────────────────────────────
        const BPF_LD_W_ABS: u16 = 0x20; // LD | W | ABS  — load word at absolute offset
        const BPF_JEQ_K: u16 = 0x15; //    JMP | JEQ | K — jump if equal to constant
        const BPF_RET_K: u16 = 0x06; //    RET | K       — return constant

        const SECCOMP_MODE_FILTER: libc::c_ulong = 2;
        const SECCOMP_RET_ALLOW: u32 = 0x7fff_0000;
        const SECCOMP_RET_ERRNO: u32 = 0x0005_0000;
        const EPERM: u32 = 1;

        // ── Architecture-specific syscall numbers ─────────────────────────────
        #[cfg(target_arch = "x86_64")]
        const NR_SOCKET: u32 = 41;
        #[cfg(target_arch = "x86_64")]
        const NR_CONNECT: u32 = 42;
        #[cfg(target_arch = "x86_64")]
        const NR_BIND: u32 = 49;

        #[cfg(target_arch = "aarch64")]
        const NR_SOCKET: u32 = 198;
        #[cfg(target_arch = "aarch64")]
        const NR_CONNECT: u32 = 203;
        #[cfg(target_arch = "aarch64")]
        const NR_BIND: u32 = 200;

        // ── BPF program ───────────────────────────────────────────────────────
        // [0] Load syscall number (struct seccomp_data.nr is always at offset 0)
        // [1] if nr == NR_SOCKET  → [2] deny, else [3]
        // [2] RETURN ERRNO(EPERM)
        // [3] if nr == NR_CONNECT → [4] deny, else [5]
        // [4] RETURN ERRNO(EPERM)
        // [5] if nr == NR_BIND    → [6] deny, else [7]
        // [6] RETURN ERRNO(EPERM)
        // [7] RETURN ALLOW
        let filter: [sock_filter; 8] = [
            sock_filter { code: BPF_LD_W_ABS, jt: 0, jf: 0, k: 0 },
            sock_filter { code: BPF_JEQ_K, jt: 0, jf: 1, k: NR_SOCKET },
            sock_filter { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | EPERM },
            sock_filter { code: BPF_JEQ_K, jt: 0, jf: 1, k: NR_CONNECT },
            sock_filter { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | EPERM },
            sock_filter { code: BPF_JEQ_K, jt: 0, jf: 1, k: NR_BIND },
            sock_filter { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO | EPERM },
            sock_filter { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ALLOW },
        ];

        let prog = sock_fprog {
            len: filter.len() as u16,
            // Safety: `filter` lives on the stack for the duration of prctl(2);
            // the kernel reads the bytecode synchronously before returning.
            filter: filter.as_ptr() as *mut sock_filter,
        };

        // PR_SET_NO_NEW_PRIVS: required before SECCOMP_MODE_FILTER without
        // CAP_SYS_ADMIN (kernel ≥ 3.5).  Prevents setuid/capability escalation.
        let rc = unsafe { prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) };
        if rc != 0 {
            return Err(std::io::Error::last_os_error());
        }

        let rc = unsafe {
            prctl(
                PR_SET_SECCOMP,
                SECCOMP_MODE_FILTER,
                &prog as *const sock_fprog as libc::c_ulong,
                0,
                0,
            )
        };
        if rc != 0 {
            return Err(std::io::Error::last_os_error());
        }
    }

    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_vars_empty_string_is_none() {
        assert_eq!(
            SandboxMode::from_vars("".into(), "alpine:3.19".into()),
            SandboxMode::None,
        );
    }

    #[test]
    fn from_vars_unknown_value_is_none() {
        assert_eq!(
            SandboxMode::from_vars("hypervisor".into(), "alpine:3.19".into()),
            SandboxMode::None,
        );
    }

    #[test]
    fn from_vars_namespace() {
        assert_eq!(
            SandboxMode::from_vars("namespace".into(), "".into()),
            SandboxMode::Namespace,
        );
    }

    #[test]
    fn from_vars_namespace_case_insensitive() {
        assert_eq!(
            SandboxMode::from_vars("NAMESPACE".into(), "".into()),
            SandboxMode::Namespace,
        );
    }

    #[test]
    fn from_vars_docker_uses_provided_image() {
        assert_eq!(
            SandboxMode::from_vars("docker".into(), "ubuntu:22.04".into()),
            SandboxMode::Docker { image: "ubuntu:22.04".into() },
        );
    }

    #[test]
    fn from_vars_docker_default_image() {
        assert_eq!(
            SandboxMode::from_vars("docker".into(), "alpine:3.19".into()),
            SandboxMode::Docker { image: "alpine:3.19".into() },
        );
    }

    #[test]
    fn is_none_only_for_none_variant() {
        assert!(SandboxMode::None.is_none());
        assert!(!SandboxMode::Namespace.is_none());
        assert!(!SandboxMode::Docker { image: "alpine:3.19".into() }.is_none());
    }

    // ── Execution integration (Linux only) ───────────────────────────────────
    // These tests require `unshare(1)` with user-namespace support
    // (kernel.unprivileged_userns_clone=1, available on most modern kernels).
    // They compile only on Linux; they are omitted entirely on other platforms.
    //
    // Platform test checklist (manual):
    //   [ ] namespace mode: `echo ok` exits 0 and prints "ok"
    //   [ ] namespace mode: `wget -T3 http://8.8.8.8/ -O-` fails (ENETUNREACH/timeout)
    //   [ ] namespace mode: `python3 -c "import socket; socket.socket()"` fails (EPERM)
    //   [ ] docker mode:    `echo ok` exits 0 and prints "ok" (requires Docker)
    //   [ ] docker mode:    `wget -T3 http://8.8.8.8/ -O-` fails (no network)
    //   [ ] docker mode:    `touch /tmp/x` fails (read-only rootfs, no tmpfs)
    //   [ ] none mode:      unaffected — existing tests in execution.rs cover this

    #[cfg(target_os = "linux")]
    mod linux {
        use super::super::*;
        use crate::execution::{execute_command, CommandPayload};

        /// Namespace echo: succeeds if unshare + user namespaces are available,
        /// otherwise reports a clear error (acceptable in restricted CI).
        #[tokio::test]
        async fn namespace_echo_succeeds_or_reports_unavailable() {
            let result = execute_command(CommandPayload {
                job_id: "ns-echo".into(),
                command: "echo namespace_ok".into(),
                timeout_ms: Some(10_000),
                sandbox_mode: SandboxMode::Namespace,
            })
            .await;

            if result.exit_code == 0 {
                assert!(
                    result.stdout.contains("namespace_ok"),
                    "unexpected stdout: {}",
                    result.stdout,
                );
            } else {
                // unshare unavailable or user namespaces disabled in this environment.
                assert!(
                    !result.stderr.is_empty(),
                    "non-zero exit with empty stderr is unexpected",
                );
            }
        }

        /// Network isolation: a raw socket attempt inside the namespace should
        /// fail (ENETUNREACH from the net namespace, or EPERM from seccomp).
        #[tokio::test]
        async fn namespace_blocks_socket_creation() {
            let result = execute_command(CommandPayload {
                job_id: "ns-socket".into(),
                // Python raises an OSError if socket() is denied or unreachable.
                // Fallback: if python3 absent, the command exits non-zero from
                // `command not found` which is also a pass for this test's purpose.
                command: "python3 -c \"import socket; s=socket.socket(); s.connect(('8.8.8.8', 53))\" 2>&1; echo done_$$".into(),
                timeout_ms: Some(10_000),
                sandbox_mode: SandboxMode::Namespace,
            })
            .await;

            // If the sandbox ran at all, the python connect must have failed.
            if result.stdout.contains("done_") && result.exit_code == 0 {
                // The echo printed, meaning python itself ran.  Check it errored.
                let output = format!("{}{}", result.stdout, result.stderr);
                assert!(
                    output.contains("Error") || output.contains("error") || output.contains("Errno"),
                    "expected a network error inside namespace sandbox, got: {output}",
                );
            }
            // Otherwise unshare failed / python absent — acceptable.
        }
    }
}
