//! Crash-safe, fail-closed Docker containment for dispatched commands.

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process::Output,
};
use tokio::{
    process::Command,
    time::{timeout, Duration},
};
use uuid::Uuid;

const DOCKER_OPERATION_TIMEOUT: Duration = Duration::from_secs(10);
const INTENT_SCHEMA_VERSION: u8 = 3;
const MANAGED_LABEL: &str = "com.axon.managed";
const OWNER_LABEL: &str = "com.axon.execution-owner";
const AGENT_LABEL: &str = "com.axon.agent-id";
const RELEASE_LABEL: &str = "com.axon.release-id";
const RUN_LABEL: &str = "com.axon.run-id";
const ATTEMPT_LABEL: &str = "com.axon.attempt-id";
const TARGET_LABEL: &str = "com.axon.target-execution-id";

#[derive(Debug, Clone, PartialEq)]
pub enum SandboxMode {
    None,
    Namespace,
    Docker {
        image: String,
        journal_root: PathBuf,
        agent_id: String,
        release_id: String,
    },
}

impl SandboxMode {
    pub fn from_env(journal_root: PathBuf, agent_id: String, release_id: String) -> Self {
        let mode = env::var("AGENT_SANDBOX_MODE").unwrap_or_default();
        let image = env::var("AGENT_SANDBOX_DOCKER_IMAGE").unwrap_or_default();
        Self::from_vars(mode, image, journal_root, agent_id, release_id)
    }

    pub(crate) fn from_vars(
        mode: String,
        docker_image: String,
        journal_root: PathBuf,
        agent_id: String,
        release_id: String,
    ) -> Self {
        match mode.trim().to_ascii_lowercase().as_str() {
            "namespace" => Self::Namespace,
            "docker" => Self::Docker {
                image: docker_image,
                journal_root,
                agent_id,
                release_id,
            },
            _ => Self::None,
        }
    }

    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }
}

pub struct ExecutionIdentity<'a> {
    pub run_id: &'a str,
    pub attempt_id: &'a str,
    pub target_execution_id: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum IntentPhase {
    Planned,
    Created,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ContainmentIntent {
    schema_version: u8,
    phase: IntentPhase,
    release_id: String,
    agent_id: String,
    run_id: String,
    attempt_id: String,
    target_execution_id: String,
    owner_token: String,
    container_name: String,
    container_id: Option<String>,
    daemon_id: String,
}

impl ContainmentIntent {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != INTENT_SCHEMA_VERSION {
            return Err(format!(
                "unsupported containment intent schema {}",
                self.schema_version
            ));
        }
        for (name, value) in [
            ("release ID", self.release_id.as_str()),
            ("agent ID", self.agent_id.as_str()),
            ("run ID", self.run_id.as_str()),
            ("attempt ID", self.attempt_id.as_str()),
            ("target execution ID", self.target_execution_id.as_str()),
        ] {
            validate_label_value(name, value)?;
        }
        if self.owner_token.len() != 32
            || !self
                .owner_token
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("invalid containment owner token".to_string());
        }
        if self.container_name != format!("axon-{}", self.owner_token) {
            return Err("containment container name does not match its owner".to_string());
        }
        if self.daemon_id.trim().is_empty() {
            return Err("Docker daemon identity is missing".to_string());
        }
        match (self.phase, self.container_id.as_deref()) {
            (IntentPhase::Planned, None) => Ok(()),
            (IntentPhase::Created, Some(id)) => validate_container_id(id),
            _ => Err("containment intent phase and container identity disagree".to_string()),
        }
    }

    fn labels(&self) -> [(&'static str, &str); 7] {
        [
            (MANAGED_LABEL, "true"),
            (OWNER_LABEL, &self.owner_token),
            (AGENT_LABEL, &self.agent_id),
            (RELEASE_LABEL, &self.release_id),
            (RUN_LABEL, &self.run_id),
            (ATTEMPT_LABEL, &self.attempt_id),
            (TARGET_LABEL, &self.target_execution_id),
        ]
    }

    fn same_execution(&self, other: &Self) -> bool {
        self.schema_version == other.schema_version
            && self.release_id == other.release_id
            && self.agent_id == other.agent_id
            && self.run_id == other.run_id
            && self.attempt_id == other.attempt_id
            && self.target_execution_id == other.target_execution_id
            && self.owner_token == other.owner_token
            && self.container_name == other.container_name
            && self.daemon_id == other.daemon_id
    }
}

pub struct SandboxedCommand {
    intent_root: PathBuf,
    intent: ContainmentIntent,
    image: String,
    command: String,
    prepared: bool,
}

impl SandboxedCommand {
    pub async fn prepare(&mut self) -> Result<Command, String> {
        if self.prepared {
            return Err("Docker containment was already prepared".to_string());
        }
        self.prepared = true;

        self.intent.daemon_id = current_docker_daemon_id().await?;
        self.intent.validate()?;
        persist_intent(&self.intent_root, &self.intent)?;

        let output = match run_docker(self.create_args()).await {
            Ok(output) => output,
            Err(error) => {
                let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
                return Err(combine_error(error, cleanup));
            }
        };
        if !output.status.success() {
            let error = format!(
                "Docker containment create failed with status {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            );
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }

        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Err(error) = validate_container_id(&container_id) {
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }
        self.intent.phase = IntentPhase::Created;
        self.intent.container_id = Some(container_id.clone());

        if let Err(error) = ensure_same_daemon(&self.intent.daemon_id).await {
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }
        if let Err(error) = persist_intent(&self.intent_root, &self.intent) {
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }
        if let Err(error) = verify_owned_container(&self.intent, &container_id).await {
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }
        if let Err(error) = verify_private_pid_mode(&container_id).await {
            let cleanup = cleanup_intent(&self.intent_root, &self.intent).await.err();
            return Err(combine_error(error, cleanup));
        }

        let mut command = Command::new("docker");
        command.args(["start", "--attach", &container_id]);
        command.kill_on_drop(true);
        Ok(command)
    }

    pub async fn cleanup_owned(&self) -> Result<(), String> {
        cleanup_intent(&self.intent_root, &self.intent).await
    }

    fn create_args(&self) -> Vec<String> {
        let mut args = vec![
            "create".into(),
            "--name".into(),
            self.intent.container_name.clone(),
            "--pull".into(),
            "never".into(),
        ];
        for (key, value) in self.intent.labels() {
            args.extend(["--label".into(), format!("{key}={value}")]);
        }
        args.extend([
            "--network".into(),
            "none".into(),
            "--read-only".into(),
            "--cap-drop".into(),
            "ALL".into(),
            "--security-opt".into(),
            "no-new-privileges".into(),
            "--pids-limit".into(),
            "128".into(),
            "--memory".into(),
            "256m".into(),
            "--cpus".into(),
            "1.0".into(),
            "--tmpfs".into(),
            "/tmp:rw,noexec,nosuid,nodev,size=64m".into(),
            "--user".into(),
            "65534:65534".into(),
            self.image.clone(),
            "sh".into(),
            "-c".into(),
            self.command.clone(),
        ]);
        args
    }
}

pub fn build_sandboxed_command(
    command: &str,
    mode: &SandboxMode,
    execution: ExecutionIdentity<'_>,
) -> Result<SandboxedCommand, String> {
    let (image, journal_root, agent_id, release_id) = match mode {
        SandboxMode::Docker {
            image,
            journal_root,
            agent_id,
            release_id,
        } => (image, journal_root, agent_id, release_id),
        SandboxMode::None => {
            return Err("command execution without containment is not permitted".to_string())
        }
        SandboxMode::Namespace => return Err("namespace sandbox mode is not supported".to_string()),
    };
    validate_pinned_image(image)?;
    for (name, value) in [
        ("release ID", release_id.as_str()),
        ("agent ID", agent_id.as_str()),
        ("run ID", execution.run_id),
        ("attempt ID", execution.attempt_id),
        ("target execution ID", execution.target_execution_id),
    ] {
        validate_label_value(name, value)?;
    }

    let owner_token = Uuid::new_v4().simple().to_string();
    Ok(SandboxedCommand {
        intent_root: containment_root(journal_root),
        intent: ContainmentIntent {
            schema_version: INTENT_SCHEMA_VERSION,
            phase: IntentPhase::Planned,
            release_id: release_id.clone(),
            agent_id: agent_id.clone(),
            run_id: execution.run_id.to_string(),
            attempt_id: execution.attempt_id.to_string(),
            target_execution_id: execution.target_execution_id.to_string(),
            container_name: format!("axon-{owner_token}"),
            owner_token,
            container_id: None,
            daemon_id: String::new(),
        },
        image: image.clone(),
        command: command.to_string(),
        prepared: false,
    })
}

/// Reconcile every durable intent for this agent before connecting to the server.
pub async fn reconcile_containment(mode: &SandboxMode) -> Result<usize, String> {
    let SandboxMode::Docker {
        journal_root,
        agent_id,
        ..
    } = mode
    else {
        return Ok(0);
    };
    let root = containment_root(journal_root);
    ensure_intent_root(&root)?;
    let intents = load_intents(&root)?;

    for intent in intents.values() {
        if intent.agent_id != agent_id.as_str() {
            return Err(format!(
                "containment intent {} belongs to agent {}, expected {}",
                intent.owner_token, intent.agent_id, agent_id
            ));
        }
    }

    let daemon_id = current_docker_daemon_id().await?;
    for intent in intents.values() {
        if intent.daemon_id != daemon_id {
            return Err(format!(
                "Docker daemon identity mismatch for containment owner {}",
                intent.owner_token
            ));
        }
    }

    let discovered = list_owned_containers(agent_id).await?;
    for id in &discovered {
        let inspected = match inspect_container(id).await? {
            InspectContainer::Present(value) => value,
            InspectContainer::Absent => {
                return Err(format!(
                    "Axon-owned Docker container {id} disappeared during recovery"
                ));
            }
        };
        let owner = inspected
            .labels
            .get(OWNER_LABEL)
            .ok_or_else(|| format!("Axon-owned Docker container {id} has no owner label"))?;
        let intent = intents.get(owner).ok_or_else(|| {
            format!("Axon-owned Docker container {id} has no durable containment intent")
        })?;
        verify_inspection(intent, &inspected)?;
    }

    for intent in intents.values() {
        cleanup_intent(&root, intent).await?;
    }
    ensure_same_daemon(&daemon_id).await?;
    let remaining = list_owned_containers(agent_id).await?;
    ensure_same_daemon(&daemon_id).await?;
    if !remaining.is_empty() {
        return Err(format!(
            "{} Axon-owned Docker container(s) remain after startup recovery",
            remaining.len()
        ));
    }
    Ok(intents.len())
}

async fn cleanup_intent(root: &Path, intent: &ContainmentIntent) -> Result<(), String> {
    intent.validate()?;
    ensure_same_daemon(&intent.daemon_id).await?;
    let reference = intent
        .container_id
        .as_deref()
        .unwrap_or(&intent.container_name);
    let inspected = inspect_container(reference).await?;
    ensure_same_daemon(&intent.daemon_id).await?;
    let inspected = match inspected {
        InspectContainer::Absent => {
            if intent.container_id.is_some()
                && matches!(
                    inspect_container(&intent.container_name).await?,
                    InspectContainer::Present(_)
                )
            {
                return Err(format!(
                    "containment name {} exists but its recorded container ID is absent",
                    intent.container_name
                ));
            }
            remove_intent(root, &intent.owner_token)?;
            return Ok(());
        }
        InspectContainer::Present(value) => value,
    };
    verify_inspection(intent, &inspected)?;

    let output = run_docker(vec!["rm".into(), "--force".into(), inspected.id.clone()]).await?;
    if !output.status.success() && !docker_reports_absent(&output) {
        return Err(format!(
            "Docker containment cleanup failed with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    ensure_same_daemon(&intent.daemon_id).await?;
    if matches!(
        inspect_container(&inspected.id).await?,
        InspectContainer::Present(_)
    ) || matches!(
        inspect_container(&intent.container_name).await?,
        InspectContainer::Present(_)
    ) {
        return Err("Docker containment cleanup did not prove container absence".to_string());
    }
    ensure_same_daemon(&intent.daemon_id).await?;
    remove_intent(root, &intent.owner_token)
}

fn containment_root(journal_root: &Path) -> PathBuf {
    journal_root.join("containment")
}

fn intent_path(root: &Path, owner: &str, phase: IntentPhase) -> PathBuf {
    let suffix = match phase {
        IntentPhase::Planned => "planned",
        IntentPhase::Created => "created",
    };
    root.join(format!("{owner}.{suffix}.json"))
}

fn ensure_intent_root(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("create containment intent root {}: {error}", root.display()))?;
    sync_directory(root)
}

fn persist_intent(root: &Path, intent: &ContainmentIntent) -> Result<(), String> {
    intent.validate()?;
    ensure_intent_root(root)?;
    let target = intent_path(root, &intent.owner_token, intent.phase);
    let temporary = root.join(format!(
        ".{}.{}.tmp",
        intent.owner_token,
        Uuid::new_v4().simple()
    ));
    let bytes = serde_json::to_vec(intent)
        .map_err(|error| format!("serialize containment intent: {error}"))?;
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("create containment intent {}: {error}", temporary.display()))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!(
                "persist containment intent {}: {error}",
                temporary.display()
            )
        })?;
    fs::rename(&temporary, &target)
        .map_err(|error| format!("publish containment intent {}: {error}", target.display()))?;
    sync_directory(root)?;
    if intent.phase == IntentPhase::Created {
        remove_if_exists(&intent_path(
            root,
            &intent.owner_token,
            IntentPhase::Planned,
        ))?;
        sync_directory(root)?;
    }
    Ok(())
}

fn remove_intent(root: &Path, owner: &str) -> Result<(), String> {
    remove_if_exists(&intent_path(root, owner, IntentPhase::Planned))?;
    remove_if_exists(&intent_path(root, owner, IntentPhase::Created))?;
    sync_directory(root)
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "remove containment intent {}: {error}",
            path.display()
        )),
    }
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    fs::File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("sync containment directory {}: {error}", path.display()))
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn load_intents(root: &Path) -> Result<HashMap<String, ContainmentIntent>, String> {
    let mut generations: HashMap<String, (Option<ContainmentIntent>, Option<ContainmentIntent>)> =
        HashMap::new();
    for entry in fs::read_dir(root)
        .map_err(|error| format!("read containment intent root {}: {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("read containment intent entry: {error}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let (owner, phase) = if let Some(owner) = name.strip_suffix(".planned.json") {
            (owner, IntentPhase::Planned)
        } else if let Some(owner) = name.strip_suffix(".created.json") {
            (owner, IntentPhase::Created)
        } else {
            continue;
        };
        let bytes = fs::read(entry.path()).map_err(|error| {
            format!(
                "read containment intent {}: {error}",
                entry.path().display()
            )
        })?;
        let intent: ContainmentIntent = serde_json::from_slice(&bytes).map_err(|error| {
            format!(
                "parse containment intent {}: {error}",
                entry.path().display()
            )
        })?;
        intent.validate()?;
        if intent.owner_token != owner || intent.phase != phase {
            return Err(format!(
                "containment intent filename does not match {}",
                entry.path().display()
            ));
        }
        let pair = generations.entry(owner.to_string()).or_default();
        let slot = if phase == IntentPhase::Planned {
            &mut pair.0
        } else {
            &mut pair.1
        };
        if slot.replace(intent).is_some() {
            return Err(format!(
                "duplicate containment intent generation for {owner}"
            ));
        }
    }

    let mut intents = HashMap::new();
    for (owner, (planned, created)) in generations {
        let selected = match (planned, created) {
            (Some(planned), Some(created)) => {
                if !planned.same_execution(&created) {
                    return Err(format!(
                        "containment generations disagree for owner {owner}"
                    ));
                }
                created
            }
            (Some(intent), None) | (None, Some(intent)) => intent,
            (None, None) => continue,
        };
        intents.insert(owner, selected);
    }
    Ok(intents)
}

#[derive(Debug)]
struct InspectedContainer {
    id: String,
    name: String,
    labels: HashMap<String, String>,
    pid_mode: String,
}

enum InspectContainer {
    Present(InspectedContainer),
    Absent,
}

#[derive(Deserialize)]
struct DockerInspect {
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Config")]
    config: DockerInspectConfig,
    #[serde(rename = "HostConfig")]
    host_config: DockerInspectHostConfig,
}

#[derive(Deserialize)]
struct DockerInspectHostConfig {
    #[serde(rename = "PidMode")]
    pid_mode: String,
}

#[derive(Deserialize)]
struct DockerInspectConfig {
    #[serde(rename = "Labels", default)]
    labels: Option<HashMap<String, String>>,
}

async fn inspect_container(reference: &str) -> Result<InspectContainer, String> {
    let output = run_docker(vec![
        "container".into(),
        "inspect".into(),
        reference.to_string(),
    ])
    .await?;
    if !output.status.success() {
        if docker_reports_absent(&output) {
            return Ok(InspectContainer::Absent);
        }
        return Err(format!(
            "Docker containment inspection failed with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let mut values: Vec<DockerInspect> = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("parse Docker containment inspection: {error}"))?;
    if values.len() != 1 {
        return Err("Docker containment inspection returned an unexpected count".to_string());
    }
    let value = values.pop().expect("length checked");
    validate_container_id(&value.id)?;
    Ok(InspectContainer::Present(InspectedContainer {
        id: value.id,
        name: value.name.trim_start_matches('/').to_string(),
        labels: value.config.labels.unwrap_or_default(),
        pid_mode: value.host_config.pid_mode,
    }))
}

async fn verify_private_pid_mode(container_id: &str) -> Result<(), String> {
    match inspect_container(container_id).await? {
        InspectContainer::Present(container) => validate_private_pid_mode(&container.pid_mode),
        InspectContainer::Absent => Err("Docker containment disappeared before start".to_string()),
    }
}

fn validate_private_pid_mode(pid_mode: &str) -> Result<(), String> {
    if pid_mode.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Docker containment PID namespace is not private: {pid_mode}"
        ))
    }
}

fn verify_inspection(
    intent: &ContainmentIntent,
    inspected: &InspectedContainer,
) -> Result<(), String> {
    if inspected.name != intent.container_name {
        return Err(format!(
            "Docker containment name mismatch for owner {}",
            intent.owner_token
        ));
    }
    if let Some(expected_id) = intent.container_id.as_deref() {
        if inspected.id != expected_id {
            return Err(format!(
                "Docker containment ID mismatch for owner {}",
                intent.owner_token
            ));
        }
    }
    for (key, expected) in intent.labels() {
        let actual = inspected.labels.get(key).map(String::as_str).unwrap_or("");
        if actual != expected {
            return Err(format!(
                "Docker containment label {key} mismatch for owner {}",
                intent.owner_token
            ));
        }
    }
    Ok(())
}

async fn list_owned_containers(agent_id: &str) -> Result<Vec<String>, String> {
    validate_label_value("agent ID", agent_id)?;
    let output = run_docker(list_owned_container_args(agent_id)).await?;
    if !output.status.success() {
        return Err(format!(
            "list Axon-owned Docker containers failed with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|id| {
            validate_container_id(id)?;
            Ok(id.to_string())
        })
        .collect()
}

fn list_owned_container_args(agent_id: &str) -> Vec<String> {
    vec![
        "ps".into(),
        "--all".into(),
        "--quiet".into(),
        "--no-trunc".into(),
        "--filter".into(),
        format!("label={MANAGED_LABEL}=true"),
        "--filter".into(),
        format!("label={AGENT_LABEL}={agent_id}"),
    ]
}

async fn verify_owned_container(intent: &ContainmentIntent, id: &str) -> Result<(), String> {
    ensure_same_daemon(&intent.daemon_id).await?;
    let inspected = match inspect_container(id).await? {
        InspectContainer::Present(value) => value,
        InspectContainer::Absent => {
            return Err("Docker containment disappeared before start".to_string())
        }
    };
    verify_inspection(intent, &inspected)?;
    ensure_same_daemon(&intent.daemon_id).await
}

async fn run_docker(args: Vec<String>) -> Result<Output, String> {
    let mut command = Command::new("docker");
    command.args(args).kill_on_drop(true);
    timeout(DOCKER_OPERATION_TIMEOUT, command.output())
        .await
        .map_err(|_| "Docker containment operation exceeded its bounded deadline".to_string())?
        .map_err(|error| format!("start Docker containment operation: {error}"))
}

async fn current_docker_daemon_id() -> Result<String, String> {
    let output = run_docker(vec!["info".into(), "--format".into(), "{{.ID}}".into()]).await?;
    if !output.status.success() {
        return Err(format!(
            "Docker daemon identity query failed with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let daemon_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if daemon_id.is_empty() {
        return Err("Docker returned an empty daemon identity".to_string());
    }
    Ok(daemon_id)
}

async fn ensure_same_daemon(expected: &str) -> Result<(), String> {
    let actual = current_docker_daemon_id().await?;
    if actual != expected {
        return Err(format!(
            "Docker daemon identity changed: expected {expected}, found {actual}"
        ));
    }
    Ok(())
}

fn validate_pinned_image(image: &str) -> Result<(), String> {
    let Some((name, digest)) = image.rsplit_once("@sha256:") else {
        return Err("Docker sandbox image must be pinned by sha256 digest".to_string());
    };
    if name.is_empty() || digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Docker sandbox image must use a complete sha256 digest".to_string());
    }
    Ok(())
}

fn validate_label_value(name: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err(format!("{name} is not safe for a Docker label"));
    }
    Ok(())
}

fn validate_container_id(cid: &str) -> Result<(), String> {
    if cid.len() != 64 || !cid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Docker did not return a full container identity".to_string());
    }
    Ok(())
}

fn docker_reports_absent(output: &Output) -> bool {
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    stderr.contains("no such object") || stderr.contains("no such container")
}

fn combine_error(primary: String, cleanup: Option<String>) -> String {
    cleanup.map_or_else(
        || primary.clone(),
        |cleanup| format!("{primary}; containment cleanup failed: {cleanup}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const PINNED_IMAGE: &str =
        "example.invalid/axon-sandbox@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("axon-containment-test-{}", Uuid::new_v4().simple()))
    }

    fn docker_mode(root: &Path) -> SandboxMode {
        SandboxMode::from_vars(
            "docker".to_string(),
            PINNED_IMAGE.to_string(),
            root.to_path_buf(),
            "agent-test".to_string(),
            "release-test".to_string(),
        )
    }

    fn execution() -> ExecutionIdentity<'static> {
        ExecutionIdentity {
            run_id: "run-test",
            attempt_id: "attempt-test",
            target_execution_id: "target-test",
        }
    }

    fn planned_intent() -> ContainmentIntent {
        let owner_token = "0123456789abcdef0123456789abcdef".to_string();
        ContainmentIntent {
            schema_version: INTENT_SCHEMA_VERSION,
            phase: IntentPhase::Planned,
            release_id: "release-test".to_string(),
            agent_id: "agent-test".to_string(),
            run_id: "run-test".to_string(),
            attempt_id: "attempt-test".to_string(),
            target_execution_id: "target-test".to_string(),
            container_name: format!("axon-{owner_token}"),
            owner_token,
            container_id: None,
            daemon_id: "daemon-test".to_string(),
        }
    }

    #[test]
    fn mode_parsing_is_explicit_and_fail_closed_at_build() {
        let root = test_root();
        assert_eq!(
            SandboxMode::from_vars(
                String::new(),
                String::new(),
                root.clone(),
                "agent-test".to_string(),
                "release-test".to_string(),
            ),
            SandboxMode::None
        );
        assert_eq!(
            SandboxMode::from_vars(
                "unknown".to_string(),
                String::new(),
                root,
                "agent-test".to_string(),
                "release-test".to_string(),
            ),
            SandboxMode::None
        );
        let error = build_sandboxed_command("true", &SandboxMode::Namespace, execution())
            .err()
            .expect("namespace mode must not execute an uncontained command");
        assert!(error.contains("not supported"));
    }

    #[test]
    fn docker_image_must_be_digest_pinned() {
        let root = test_root();
        let mode = SandboxMode::from_vars(
            "docker".to_string(),
            "alpine:3.19".to_string(),
            root,
            "agent-test".to_string(),
            "release-test".to_string(),
        );
        let error = build_sandboxed_command("true", &mode, execution())
            .err()
            .expect("tagged image must be rejected");
        assert!(error.contains("pinned"));
    }

    #[test]
    fn docker_create_arguments_bind_identity_without_host_mounts() {
        let root = test_root();
        let command = build_sandboxed_command("printf safe", &docker_mode(&root), execution())
            .expect("valid Docker containment");
        let args = command.create_args();
        let joined = args.join(" ");
        for (key, value) in command.intent.labels() {
            assert!(joined.contains(&format!("{key}={value}")));
        }
        assert!(joined.contains("--network none"));
        assert!(joined.contains("--read-only"));
        assert!(!args.iter().any(|arg| arg == "--pid"));
        assert!(!args.iter().any(|arg| arg == "--volume" || arg == "-v"));
        assert!(!joined.contains("docker.sock"));
        assert!(!joined.contains(&root.display().to_string()));
    }

    #[test]
    fn command_names_are_unique_and_intents_use_the_journal_root() {
        let root = test_root();
        let first = build_sandboxed_command("true", &docker_mode(&root), execution())
            .expect("first command");
        let second = build_sandboxed_command("true", &docker_mode(&root), execution())
            .expect("second command");
        assert_ne!(first.intent.container_name, second.intent.container_name);
        assert_eq!(first.intent_root, root.join("containment"));
        assert_eq!(first.intent.run_id, "run-test");
        assert_eq!(first.intent.attempt_id, "attempt-test");
        assert_eq!(first.intent.target_execution_id, "target-test");
    }

    #[test]
    fn durable_intent_moves_from_planned_to_created_generation() {
        let root = test_root();
        let mut intent = planned_intent();
        persist_intent(&root, &intent).expect("persist planned intent");
        assert!(intent_path(&root, &intent.owner_token, IntentPhase::Planned).is_file());

        intent.phase = IntentPhase::Created;
        intent.container_id = Some("b".repeat(64));
        persist_intent(&root, &intent).expect("persist created intent");
        assert!(!intent_path(&root, &intent.owner_token, IntentPhase::Planned).exists());
        assert!(intent_path(&root, &intent.owner_token, IntentPhase::Created).is_file());
        assert_eq!(
            load_intents(&root)
                .expect("load intent")
                .get(&intent.owner_token),
            Some(&intent)
        );
        fs::remove_dir_all(&root).expect("remove test intent root");
    }

    #[test]
    fn malformed_or_misnamed_intent_fails_recovery() {
        let root = test_root();
        ensure_intent_root(&root).expect("create intent root");
        fs::write(root.join("bad.planned.json"), b"{not-json").expect("write malformed intent");
        let error = load_intents(&root).expect_err("malformed intent must fail closed");
        assert!(error.contains("parse containment intent"));
        fs::remove_dir_all(&root).expect("remove test intent root");
    }

    #[test]
    fn inspection_rejects_owner_label_mismatch() {
        let intent = planned_intent();
        let mut labels = intent
            .labels()
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect::<HashMap<_, _>>();
        labels.insert(
            OWNER_LABEL.to_string(),
            "ffffffffffffffffffffffffffffffff".to_string(),
        );
        let inspected = InspectedContainer {
            id: "c".repeat(64),
            name: intent.container_name.clone(),
            labels,
            pid_mode: String::new(),
        };
        let error =
            verify_inspection(&intent, &inspected).expect_err("owner mismatch must fail closed");
        assert!(error.contains(OWNER_LABEL));
    }

    #[test]
    fn containment_rejects_shared_pid_modes() {
        assert!(validate_private_pid_mode("").is_ok());
        assert!(validate_private_pid_mode("host").is_err());
        assert!(validate_private_pid_mode("container:peer").is_err());
    }

    #[test]
    fn full_container_identity_is_required() {
        assert!(validate_container_id("abc123").is_err());
        assert!(validate_container_id(&"d".repeat(64)).is_ok());
        assert!(list_owned_container_args("agent-test")
            .iter()
            .any(|argument| argument == "--no-trunc"));
    }

    #[tokio::test]
    async fn docker_recovery_covers_crash_windows_and_preserves_sentinel() {
        if std::env::var("AXON_RUN_DOCKER_CONTAINMENT_TESTS").as_deref() != Ok("1") {
            return;
        }
        let image = std::env::var("AXON_TEST_DOCKER_IMAGE")
            .expect("AXON_TEST_DOCKER_IMAGE must name a locally loaded digest-pinned image");
        validate_pinned_image(&image).expect("integration image must be digest pinned");
        let root = test_root();
        let mode = SandboxMode::from_vars(
            "docker".to_string(),
            image.clone(),
            root.clone(),
            "agent-integration".to_string(),
            "release-integration".to_string(),
        );
        let sentinel_name = format!("axon-unrelated-{}", Uuid::new_v4().simple());
        let sentinel = run_docker(vec![
            "create".into(),
            "--name".into(),
            sentinel_name.clone(),
            "--pull".into(),
            "never".into(),
            image,
            "sh".into(),
            "-c".into(),
            "sleep 60".into(),
        ])
        .await
        .expect("create unrelated sentinel");
        assert!(sentinel.status.success(), "sentinel create failed");

        let mut before_create = build_sandboxed_command(
            "true",
            &mode,
            ExecutionIdentity {
                run_id: "run-before-create",
                attempt_id: "attempt-before-create",
                target_execution_id: "target-before-create",
            },
        )
        .expect("build before-create command");
        before_create.intent.daemon_id = current_docker_daemon_id().await.expect("daemon ID");
        persist_intent(&before_create.intent_root, &before_create.intent)
            .expect("persist pre-create intent");
        assert_eq!(
            reconcile_containment(&mode)
                .await
                .expect("recover before create"),
            1
        );

        let mut after_create = build_sandboxed_command(
            "sleep 60",
            &mode,
            ExecutionIdentity {
                run_id: "run-after-create",
                attempt_id: "attempt-after-create",
                target_execution_id: "target-after-create",
            },
        )
        .expect("build after-create command");
        let _start = after_create
            .prepare()
            .await
            .expect("create stopped container");
        assert_eq!(
            reconcile_containment(&mode)
                .await
                .expect("recover after create"),
            1
        );

        let mut after_start = build_sandboxed_command(
            "sleep 60 & wait",
            &mode,
            ExecutionIdentity {
                run_id: "run-after-start",
                attempt_id: "attempt-after-start",
                target_execution_id: "target-after-start",
            },
        )
        .expect("build after-start command");
        let mut start = after_start
            .prepare()
            .await
            .expect("create running container");
        let mut child = start.spawn().expect("start container");
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(
            reconcile_containment(&mode)
                .await
                .expect("recover after start"),
            1
        );
        let _ = child.wait().await;

        assert!(matches!(
            inspect_container(&sentinel_name)
                .await
                .expect("inspect sentinel"),
            InspectContainer::Present(_)
        ));
        let removed = run_docker(vec!["rm".into(), "--force".into(), sentinel_name])
            .await
            .expect("remove unrelated sentinel");
        assert!(removed.status.success());
        fs::remove_dir_all(&root).expect("remove integration intent root");
    }
}
