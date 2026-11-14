use crate::execution::{CommandResult, ExecutionOutcome};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const JOURNAL_SCHEMA_VERSION: u8 = 1;
const TERMINAL_RETENTION_GRACE_MS: u64 = 60_000;

#[derive(Debug)]
pub enum JournalError {
    Io(String),
    CorruptRecord(String),
    AttemptIdConflict,
    JournalFull,
    InvalidTransition(String),
}

impl fmt::Display for JournalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(message) | Self::CorruptRecord(message) | Self::InvalidTransition(message) => {
                formatter.write_str(message)
            }
            Self::AttemptIdConflict => {
                formatter.write_str("attemptId was reused with different immutable dispatch fields")
            }
            Self::JournalFull => formatter.write_str(
                "attempt journal is full and has no safely expired terminal record to evict",
            ),
        }
    }
}

impl std::error::Error for JournalError {}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct AttemptDescriptor {
    pub protocol_version: u8,
    pub org_id: String,
    pub job_id: String,
    pub target_agent_id: String,
    pub run_id: String,
    pub target_execution_id: String,
    pub attempt_id: String,
    pub operation_id: String,
    pub action_version: String,
    pub command_sha256: String,
    pub allowed_commands_sha256: String,
    pub timeout_ms: u64,
    pub start_before: u64,
    pub max_output_bytes: u64,
}

impl AttemptDescriptor {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        protocol_version: u8,
        org_id: String,
        job_id: String,
        target_agent_id: String,
        run_id: String,
        target_execution_id: String,
        attempt_id: String,
        operation_id: String,
        action_version: String,
        command: &str,
        allowed_commands: &[String],
        timeout_ms: u64,
        start_before: u64,
        max_output_bytes: u64,
    ) -> Self {
        let allowlist = serde_json::to_vec(allowed_commands).unwrap_or_default();
        Self {
            protocol_version,
            org_id,
            job_id,
            target_agent_id,
            run_id,
            target_execution_id,
            attempt_id,
            operation_id,
            action_version,
            command_sha256: sha256_hex(command.as_bytes()),
            allowed_commands_sha256: sha256_hex(&allowlist),
            timeout_ms,
            start_before,
            max_output_bytes,
        }
    }

    fn restarted_result(&self) -> CommandResult {
        CommandResult {
            protocol_version: self.protocol_version,
            job_id: self.job_id.clone(),
            target_agent_id: self.target_agent_id.clone(),
            run_id: self.run_id.clone(),
            target_execution_id: self.target_execution_id.clone(),
            attempt_id: self.attempt_id.clone(),
            operation_id: self.operation_id.clone(),
            outcome: ExecutionOutcome::Unknown,
            exit_code: None,
            reason_code: Some("AGENT_RESTARTED_DURING_ATTEMPT".to_string()),
            stdout: String::new(),
            stderr: "agent restarted after accepting the attempt".to_string(),
            stdout_truncated: false,
            stderr_truncated: false,
            duration_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum JournalState {
    Received,
    Running,
    Terminal,
    Quarantined,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalEntry {
    schema_version: u8,
    attempt_id: String,
    descriptor: Option<AttemptDescriptor>,
    state: JournalState,
    terminal_result: Option<CommandResult>,
    updated_at_ms: u64,
}

impl JournalEntry {
    fn received(descriptor: AttemptDescriptor) -> Self {
        Self {
            schema_version: JOURNAL_SCHEMA_VERSION,
            attempt_id: descriptor.attempt_id.clone(),
            descriptor: Some(descriptor),
            state: JournalState::Received,
            terminal_result: None,
            updated_at_ms: now_ms(),
        }
    }

    fn quarantined(attempt_id: String) -> Self {
        Self {
            schema_version: JOURNAL_SCHEMA_VERSION,
            attempt_id,
            descriptor: None,
            state: JournalState::Quarantined,
            terminal_result: None,
            updated_at_ms: now_ms(),
        }
    }

    fn is_structurally_valid(&self, expected_attempt_id: &str) -> bool {
        if self.schema_version != JOURNAL_SCHEMA_VERSION || self.attempt_id != expected_attempt_id {
            return false;
        }
        match self.state {
            JournalState::Received | JournalState::Running => {
                self.descriptor.is_some() && self.terminal_result.is_none()
            }
            JournalState::Terminal => self.descriptor.is_some() && self.terminal_result.is_some(),
            JournalState::Quarantined => {
                self.descriptor.is_none() && self.terminal_result.is_none()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiveDecision {
    New,
    ActiveDuplicate,
    TerminalDuplicate(Box<CommandResult>),
    Conflict,
}

pub struct AttemptJournal {
    root: PathBuf,
    max_entries: usize,
    lock: Mutex<()>,
}

impl AttemptJournal {
    pub fn open(root: impl AsRef<Path>, max_entries: usize) -> Result<Self, JournalError> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root).map_err(io_error)?;
        set_directory_permissions(&root)?;
        let journal = Self {
            root,
            max_entries: max_entries.max(1),
            lock: Mutex::new(()),
        };
        journal.clean_stale_temp_files()?;
        journal.recover_interrupted()?;
        Ok(journal)
    }

    pub fn receive(&self, descriptor: &AttemptDescriptor) -> Result<ReceiveDecision, JournalError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| JournalError::Io("journal lock poisoned".to_string()))?;
        let path = self.entry_path(&descriptor.attempt_id)?;

        if path.exists() {
            let entry = self.load_entry_or_quarantine(&path, &descriptor.attempt_id)?;
            if entry.state == JournalState::Quarantined {
                return Err(JournalError::CorruptRecord(format!(
                    "attempt {} has a quarantined journal record",
                    descriptor.attempt_id
                )));
            }
            if entry.descriptor.as_ref() != Some(descriptor) {
                return Ok(ReceiveDecision::Conflict);
            }
            return match entry.state {
                JournalState::Received | JournalState::Running => {
                    Ok(ReceiveDecision::ActiveDuplicate)
                }
                JournalState::Terminal => Ok(ReceiveDecision::TerminalDuplicate(Box::new(
                    entry
                        .terminal_result
                        .expect("validated terminal entry has a result"),
                ))),
                JournalState::Quarantined => unreachable!(),
            };
        }

        self.make_room_for_new_entry()?;
        self.write_entry(&path, &JournalEntry::received(descriptor.clone()))?;
        Ok(ReceiveDecision::New)
    }

    pub fn mark_running(&self, descriptor: &AttemptDescriptor) -> Result<(), JournalError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| JournalError::Io("journal lock poisoned".to_string()))?;
        let path = self.entry_path(&descriptor.attempt_id)?;
        let mut entry = self.load_entry_or_quarantine(&path, &descriptor.attempt_id)?;
        self.validate_descriptor(&entry, descriptor)?;

        match entry.state {
            JournalState::Received => {
                entry.state = JournalState::Running;
                entry.updated_at_ms = now_ms();
                self.write_entry(&path, &entry)
            }
            JournalState::Running => Ok(()),
            JournalState::Terminal | JournalState::Quarantined => Err(
                JournalError::InvalidTransition("cannot start a terminal attempt".to_string()),
            ),
        }
    }

    pub fn complete(
        &self,
        descriptor: &AttemptDescriptor,
        result: CommandResult,
    ) -> Result<(), JournalError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| JournalError::Io("journal lock poisoned".to_string()))?;
        let path = self.entry_path(&descriptor.attempt_id)?;
        let mut entry = self.load_entry_or_quarantine(&path, &descriptor.attempt_id)?;
        self.validate_descriptor(&entry, descriptor)?;

        match entry.state {
            JournalState::Received | JournalState::Running => {
                entry.state = JournalState::Terminal;
                entry.terminal_result = Some(result);
                entry.updated_at_ms = now_ms();
                self.write_entry(&path, &entry)
            }
            JournalState::Terminal if entry.terminal_result.as_ref() == Some(&result) => Ok(()),
            JournalState::Terminal => Err(JournalError::InvalidTransition(
                "terminal result cannot be replaced".to_string(),
            )),
            JournalState::Quarantined => Err(JournalError::CorruptRecord(format!(
                "attempt {} has a quarantined journal record",
                descriptor.attempt_id
            ))),
        }
    }

    /// Verifies whether an attempt is recorded as Terminal in the journal
    /// and whether its outcome is conclusive/terminal (e.g. Unknown/Completed).
    pub fn is_attempt_terminal_and_quiescent(&self, attempt_id: &str) -> Result<bool, JournalError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| JournalError::Io("journal lock poisoned".to_string()))?;
        let path = self.entry_path(attempt_id)?;
        if !path.exists() {
            return Ok(false);
        }
        let entry = self.load_entry_or_quarantine(&path, attempt_id)?;
        match entry.state {
            JournalState::Terminal => Ok(entry.terminal_result.is_some()),
            JournalState::Received | JournalState::Running | JournalState::Quarantined => Ok(false),
        }
    }

    fn recover_interrupted(&self) -> Result<usize, JournalError> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| JournalError::Io("journal lock poisoned".to_string()))?;
        let mut recovered = 0;
        for path in self.canonical_entry_paths()? {
            let attempt_id = match path.file_stem().and_then(|value| value.to_str()) {
                Some(value) => value.to_string(),
                None => continue,
            };
            let mut entry = match self.load_entry_or_quarantine(&path, &attempt_id) {
                Ok(entry) => entry,
                Err(JournalError::CorruptRecord(_)) => continue,
                Err(error) => return Err(error),
            };
            if matches!(entry.state, JournalState::Received | JournalState::Running) {
                let result = entry
                    .descriptor
                    .as_ref()
                    .expect("validated active entry has a descriptor")
                    .restarted_result();
                entry.state = JournalState::Terminal;
                entry.terminal_result = Some(result);
                entry.updated_at_ms = now_ms();
                self.write_entry(&path, &entry)?;
                recovered += 1;
            }
        }
        Ok(recovered)
    }

    fn validate_descriptor(
        &self,
        entry: &JournalEntry,
        descriptor: &AttemptDescriptor,
    ) -> Result<(), JournalError> {
        if entry.state == JournalState::Quarantined {
            return Err(JournalError::CorruptRecord(format!(
                "attempt {} has a quarantined journal record",
                descriptor.attempt_id
            )));
        }
        if entry.descriptor.as_ref() != Some(descriptor) {
            return Err(JournalError::AttemptIdConflict);
        }
        Ok(())
    }

    fn make_room_for_new_entry(&self) -> Result<(), JournalError> {
        let paths = self.canonical_entry_paths()?;
        if paths.len() < self.max_entries {
            return Ok(());
        }

        let mut removable = Vec::new();
        for path in &paths {
            let attempt_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            match self.load_entry_or_quarantine(path, attempt_id) {
                Ok(entry) if entry.state == JournalState::Terminal => {
                    let safely_expired = entry
                        .descriptor
                        .as_ref()
                        .map(|descriptor| {
                            now_ms()
                                > descriptor
                                    .start_before
                                    .saturating_add(TERMINAL_RETENTION_GRACE_MS)
                        })
                        .unwrap_or(false);
                    if safely_expired {
                        removable.push((entry.updated_at_ms, path.clone()));
                    }
                }
                // Quarantine tombstones have no trustworthy dispatch deadline.
                // Retaining them permanently is fail-closed; operators must
                // investigate and remove them deliberately.
                Ok(_) | Err(JournalError::CorruptRecord(_)) => {}
                Err(error) => return Err(error),
            }
        }
        removable.sort_by_key(|(updated_at, _)| *updated_at);

        let remove_count = paths.len() + 1 - self.max_entries;
        if removable.len() < remove_count {
            return Err(JournalError::JournalFull);
        }
        for (_, path) in removable.into_iter().take(remove_count) {
            fs::remove_file(path).map_err(io_error)?;
        }
        sync_directory(&self.root)?;
        Ok(())
    }

    fn canonical_entry_paths(&self) -> Result<Vec<PathBuf>, JournalError> {
        let mut paths = Vec::new();
        for item in fs::read_dir(&self.root).map_err(io_error)? {
            let path = item.map_err(io_error)?.path();
            if path.extension().and_then(|value| value.to_str()) == Some("json") {
                paths.push(path);
            }
        }
        Ok(paths)
    }

    fn clean_stale_temp_files(&self) -> Result<(), JournalError> {
        for item in fs::read_dir(&self.root).map_err(io_error)? {
            let path = item.map_err(io_error)?.path();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if name.starts_with(".tmp-") {
                fs::remove_file(path).map_err(io_error)?;
            }
        }
        Ok(())
    }

    fn load_entry_or_quarantine(
        &self,
        path: &Path,
        attempt_id: &str,
    ) -> Result<JournalEntry, JournalError> {
        let bytes = fs::read(path).map_err(io_error)?;
        match serde_json::from_slice::<JournalEntry>(&bytes) {
            Ok(entry) if entry.is_structurally_valid(attempt_id) => Ok(entry),
            Ok(_) | Err(_) => {
                self.quarantine(path, attempt_id)?;
                Err(JournalError::CorruptRecord(format!(
                    "attempt {attempt_id} journal record was corrupt and quarantined"
                )))
            }
        }
    }

    fn quarantine(&self, path: &Path, attempt_id: &str) -> Result<(), JournalError> {
        let quarantine_path = self.root.join(format!(
            "{attempt_id}.corrupt-{}-{}",
            now_ms(),
            Uuid::new_v4()
        ));
        fs::copy(path, &quarantine_path).map_err(io_error)?;
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(&quarantine_path)
            .and_then(|file| file.sync_all())
            .map_err(io_error)?;
        sync_directory(&self.root)?;

        // Keep the corrupt canonical record in place until the fail-closed
        // sentinel is atomically published. A crash at any earlier point will
        // rediscover the corrupt canonical record on restart.
        let sentinel = JournalEntry::quarantined(attempt_id.to_string());
        self.write_entry(path, &sentinel)
    }

    fn entry_path(&self, attempt_id: &str) -> Result<PathBuf, JournalError> {
        Uuid::parse_str(attempt_id)
            .map_err(|_| JournalError::InvalidTransition("attemptId must be a UUID".to_string()))?;
        Ok(self.root.join(format!("{attempt_id}.json")))
    }

    fn write_entry(&self, destination: &Path, entry: &JournalEntry) -> Result<(), JournalError> {
        let mut bytes = serde_json::to_vec(entry)
            .map_err(|error| JournalError::Io(format!("serialize journal record: {error}")))?;
        bytes.push(b'\n');
        let temporary = self.root.join(format!(".tmp-{}", Uuid::new_v4()));

        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(io_error)?;
        file.write_all(&bytes).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
        drop(file);

        if let Err(error) = atomic_replace(&temporary, destination) {
            let _ = fs::remove_file(&temporary);
            return Err(io_error(error));
        }
        sync_directory(&self.root)?;
        Ok(())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn io_error(error: std::io::Error) -> JournalError {
    JournalError::Io(error.to_string())
}

#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: u32,
            exclude: *mut std::ffi::c_void,
            reserved: *mut std::ffi::c_void,
        ) -> i32;
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    const MOVE_FILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVE_FILE_WRITE_THROUGH: u32 = 0x8;
    const REPLACE_FILE_WRITE_THROUGH: u32 = 0x1;

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = if destination.exists() {
        // ReplaceFileW atomically publishes a replacement over an existing
        // durable record without an unsafe remove-before-rename window.
        unsafe {
            ReplaceFileW(
                destination_wide.as_ptr(),
                source_wide.as_ptr(),
                std::ptr::null(),
                REPLACE_FILE_WRITE_THROUGH,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        }
    } else {
        unsafe {
            MoveFileExW(
                source_wide.as_ptr(),
                destination_wide.as_ptr(),
                MOVE_FILE_REPLACE_EXISTING | MOVE_FILE_WRITE_THROUGH,
            )
        }
    };
    if replaced == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn set_directory_permissions(path: &Path) -> Result<(), JournalError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(io_error)
}

#[cfg(not(unix))]
fn set_directory_permissions(_path: &Path) -> Result<(), JournalError> {
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), JournalError> {
    fs::File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(io_error)
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), JournalError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("axon-journal-test-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn descriptor(attempt_id: String) -> AttemptDescriptor {
        descriptor_with_start_before(attempt_id, now_ms() + 5_000)
    }

    fn expired_descriptor(attempt_id: String) -> AttemptDescriptor {
        descriptor_with_start_before(
            attempt_id,
            now_ms().saturating_sub(TERMINAL_RETENTION_GRACE_MS + 1),
        )
    }

    fn descriptor_with_start_before(attempt_id: String, start_before: u64) -> AttemptDescriptor {
        AttemptDescriptor::new(
            2,
            "org-1".to_string(),
            "job-1".to_string(),
            "agent-1".to_string(),
            "run-1".to_string(),
            "target-1".to_string(),
            attempt_id,
            "operation-1".to_string(),
            "v1".to_string(),
            "echo safe",
            &["echo".to_string()],
            5_000,
            start_before,
            65_536,
        )
    }

    fn result(descriptor: &AttemptDescriptor) -> CommandResult {
        CommandResult {
            protocol_version: 2,
            job_id: descriptor.job_id.clone(),
            target_agent_id: descriptor.target_agent_id.clone(),
            run_id: descriptor.run_id.clone(),
            target_execution_id: descriptor.target_execution_id.clone(),
            attempt_id: descriptor.attempt_id.clone(),
            operation_id: descriptor.operation_id.clone(),
            outcome: ExecutionOutcome::Completed,
            exit_code: Some(0),
            reason_code: None,
            stdout: "ok\n".to_string(),
            stderr: String::new(),
            stdout_truncated: false,
            stderr_truncated: false,
            duration_ms: 3,
        }
    }

    #[test]
    fn identical_active_duplicate_does_not_create_another_attempt() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 10).unwrap();
        let descriptor = descriptor(Uuid::new_v4().to_string());

        assert_eq!(journal.receive(&descriptor).unwrap(), ReceiveDecision::New);
        assert_eq!(
            journal.receive(&descriptor).unwrap(),
            ReceiveDecision::ActiveDuplicate
        );
        journal.mark_running(&descriptor).unwrap();
        assert_eq!(
            journal.receive(&descriptor).unwrap(),
            ReceiveDecision::ActiveDuplicate
        );
        assert_eq!(journal.canonical_entry_paths().unwrap().len(), 1);
    }

    #[test]
    fn identical_terminal_duplicate_replays_stored_result() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 10).unwrap();
        let descriptor = descriptor(Uuid::new_v4().to_string());
        let expected = result(&descriptor);

        journal.receive(&descriptor).unwrap();
        journal.mark_running(&descriptor).unwrap();
        journal.complete(&descriptor, expected.clone()).unwrap();

        assert_eq!(
            journal.receive(&descriptor).unwrap(),
            ReceiveDecision::TerminalDuplicate(Box::new(expected))
        );
    }

    #[test]
    fn conflicting_attempt_id_reuse_is_rejected() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 10).unwrap();
        let descriptor = descriptor(Uuid::new_v4().to_string());
        journal.receive(&descriptor).unwrap();

        let mut conflicting = descriptor.clone();
        conflicting.command_sha256 = sha256_hex(b"different command");
        assert_eq!(
            journal.receive(&conflicting).unwrap(),
            ReceiveDecision::Conflict
        );
    }

    #[test]
    fn startup_recovers_received_and_running_attempts_as_unknown() {
        for mark_running in [false, true] {
            let directory = TestDirectory::new();
            let descriptor = descriptor(Uuid::new_v4().to_string());
            {
                let journal = AttemptJournal::open(&directory.0, 10).unwrap();
                journal.receive(&descriptor).unwrap();
                if mark_running {
                    journal.mark_running(&descriptor).unwrap();
                }
            }

            let journal = AttemptJournal::open(&directory.0, 10).unwrap();
            let replay = match journal.receive(&descriptor).unwrap() {
                ReceiveDecision::TerminalDuplicate(result) => result,
                decision => panic!("unexpected recovery decision: {decision:?}"),
            };
            assert_eq!(replay.outcome, ExecutionOutcome::Unknown);
            assert_eq!(
                replay.reason_code.as_deref(),
                Some("AGENT_RESTARTED_DURING_ATTEMPT")
            );
        }
    }

    #[test]
    fn corrupt_record_is_quarantined_and_fails_closed() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 10).unwrap();
        let descriptor = descriptor(Uuid::new_v4().to_string());
        let path = journal.entry_path(&descriptor.attempt_id).unwrap();
        fs::write(&path, b"{definitely not json").unwrap();

        let corrupt_result = journal.receive(&descriptor);
        assert!(
            matches!(corrupt_result, Err(JournalError::CorruptRecord(_))),
            "unexpected quarantine result: {corrupt_result:?}"
        );
        assert!(path.exists(), "a fail-closed sentinel must remain");
        assert!(
            fs::read_dir(&directory.0)
                .unwrap()
                .filter_map(Result::ok)
                .any(|item| item.file_name().to_string_lossy().contains(".corrupt-")),
            "the original corrupt bytes must be quarantined"
        );
        let corrupt_result = journal.receive(&descriptor);
        assert!(
            matches!(corrupt_result, Err(JournalError::CorruptRecord(_))),
            "unexpected quarantine result: {corrupt_result:?}"
        );

        drop(journal);
        let reopened = AttemptJournal::open(&directory.0, 10).unwrap();
        assert!(matches!(
            reopened.receive(&descriptor),
            Err(JournalError::CorruptRecord(_))
        ));
    }

    #[test]
    fn retention_evicts_only_safely_expired_terminal_records() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 2).unwrap();
        let terminal = expired_descriptor(Uuid::new_v4().to_string());
        let active = descriptor(Uuid::new_v4().to_string());
        let incoming = descriptor(Uuid::new_v4().to_string());

        journal.receive(&terminal).unwrap();
        journal.complete(&terminal, result(&terminal)).unwrap();
        journal.receive(&active).unwrap();
        journal.receive(&incoming).unwrap();

        assert!(!journal.entry_path(&terminal.attempt_id).unwrap().exists());
        assert!(journal.entry_path(&active.attempt_id).unwrap().exists());
        assert!(journal.entry_path(&incoming.attempt_id).unwrap().exists());
    }

    #[test]
    fn retention_refuses_to_forget_a_replayable_terminal_record() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 1).unwrap();
        let terminal = descriptor(Uuid::new_v4().to_string());
        let incoming = descriptor(Uuid::new_v4().to_string());

        journal.receive(&terminal).unwrap();
        journal.complete(&terminal, result(&terminal)).unwrap();

        assert!(matches!(
            journal.receive(&incoming),
            Err(JournalError::JournalFull)
        ));
        assert_eq!(
            journal.receive(&terminal).unwrap(),
            ReceiveDecision::TerminalDuplicate(Box::new(result(&terminal)))
        );
    }

    #[test]
    fn retention_never_evicts_a_quarantine_tombstone() {
        let directory = TestDirectory::new();
        let journal = AttemptJournal::open(&directory.0, 1).unwrap();
        let corrupt = descriptor(Uuid::new_v4().to_string());
        let incoming = descriptor(Uuid::new_v4().to_string());
        let path = journal.entry_path(&corrupt.attempt_id).unwrap();
        fs::write(&path, b"corrupt").unwrap();

        let corrupt_result = journal.receive(&corrupt);
        assert!(
            matches!(corrupt_result, Err(JournalError::CorruptRecord(_))),
            "unexpected quarantine result: {corrupt_result:?}"
        );
        assert!(matches!(
            journal.receive(&incoming),
            Err(JournalError::JournalFull)
        ));
        let corrupt_result = journal.receive(&corrupt);
        assert!(
            matches!(corrupt_result, Err(JournalError::CorruptRecord(_))),
            "unexpected quarantine result: {corrupt_result:?}"
        );
    }
}
