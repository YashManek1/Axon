# R2-04 durability and matched-release decision

Status: accepted for implementation on 2026-09-19.

## Dispatch durability

`JobRun` is the transactional dispatch outbox. Creating a run in `ACCEPTED` persists the complete immutable dispatch intent and its single attempt before Redis is touched. The attempt ID is also the BullMQ job ID, so reconciliation can safely repeat the queue write.

Recovery may enqueue only an `ACCEPTED` run. Once a run reaches `QUEUED` or any later state, loss of queue evidence must resolve to `UNKNOWN`; it must never cause automatic command replay. Competing reconcilers rely on the deterministic queue identity and compare-and-set state transitions. A queue write that cannot be verified also resolves to `UNKNOWN`.

## Agent journal

The Rust agent writes a local journal entry before acknowledging a valid dispatch. The entry is keyed by attempt ID and retains the immutable dispatch fields, state and terminal result. An identical duplicate never starts another process: an active entry is acknowledged without a second execution, and a terminal entry is acknowledged and its stored result is replayed. Reuse of an attempt ID with different immutable fields is rejected.

The agent marks an entry running before process creation and persists the terminal result before sending it. On startup, an unfinished entry becomes a terminal `UNKNOWN` result with reason `AGENT_RESTARTED_DURING_ATTEMPT`. This preserves at-most-once execution and makes uncertainty explicit. The backend does not automatically redispatch acknowledged or uncertain attempts.

## Linux containment

On supported Linux hosts each command runs in a new process group. Timeout termination targets the process group and waits for the direct child. Acceptance must prove that a descendant created by the command does not survive the timeout.

## Matched release

The agent includes `releaseId` in socket authentication. The backend records it and, when `AXON_RELEASE_ID` is configured, refuses protocol-v2 dispatch to a socket whose release ID differs or is absent. Development may omit the expected release ID; production acceptance must set it on both components and record it in the evidence manifest.

## Migration and rollback

All added persistence is backward compatible. Existing JobRun records retain their original recovery semantics, legacy agents may connect, and release-gated dispatch fails closed when a production release ID is required. Rollback requires quiescing dispatch, reconciling all nonterminal runs, restoring the matched backend and agent build, resetting only isolated Redis telemetry ownership keys when the documented Redis-ahead condition exists, reconnecting agents, and verifying that Mongo connection generations never decrease before dispatch resumes.
