# Axon Codex operating model

12 September 2026. This improves work/context discipline; it does not change model capabilities, raise account limits or establish a measured savings percentage.

## Configuration
Claude has 86 project skills and 10 personal roles. Retain that library on demand. Codex starts from one compact checkpoint, a tracker, two targeted skills, five project agents and one bounded continuity hook. `AGENTS.md` holds durable rules. `.codex/config.toml` selects Sol/high for new Axon sessions, at most three workers, bounded tool history and non-login shells. It corrects the graph MCP working directory from Yantra to Axon. Existing app/thread overrides may take precedence; this does not hot-switch a running session or change unrelated projects' model.

Supported locations are `.agents/skills/` and `.codex/agents/`. When the runtime only exposes generic spawning, pass the brief/model explicitly. [Skills](https://learn.chatgpt.com/docs/build-skills), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Routing
| Work | Default | Boundary |
|---|---|---|
| Routine coordination and backend/Rust implementation | Sol/high | Accepted contract; exclusive files |
| Product, shared contracts and integration gates | Astra/high | Decide before implementation; accept after stabilization |
| Frontend journey | Terra/medium | Agreed API; escalate ambiguity |
| Read-only investigation | Luna/medium | Exact question and evidence |
| Independent security review | Astra/high | Stabilized source; no edits |

Three workers is a ceiling, not a target. Do short known work directly. Reuse workers for dependent follow-ups. Do not spawn another reviewer merely to repeat a completed review.

The exact Sol-to-Astra gate and nine-step execution loop are in [BRAIN-PLAN.md](BRAIN-PLAN.md). The SessionStart hook loads only the checkpoint and tracker on startup, resume, clear and compaction; it does not run tests, update graphs or read transcripts.

## Task packet
```text
Outcome: observable result.
Context: exact files, current behavior, accepted contract.
Exclusive writes: paths; all others read-only.
Constraints: authorization, compatibility, data/failure boundaries.
Acceptance: actual behavior, required commands and limits.
Return: files, result, command/exit/counts, evidence path, risks.
```

## Evidence
Use `scripts/codex/axon-check.ps1` where suitable. Full output and structured command/exit/fingerprint records go in `.codex/evidence/`. Fingerprints help invalidate stale results; they are not automatic permission to skip a new failure case or changed runtime. Source edits during a check invalidate its result. See the runner help/modes for limits.

Recover actual command exits after interruptions. A summary showing passing assertions can coexist with an unhandled error. Do not rerun a completed unchanged suite merely because the agent session ended. Do rerun affected behavior after source/dependency/runtime changes. Overlapping counts are not additive. Security review and integration review remain distinct from test execution.

## Context budget
- Search what can affect the active decision. `rg` first for known text/files; graph/symbol tools for relationships when available and current. Never use another project's graph by accident.
- Store logs; return failures/summaries. Parse session responses before emitting them. No raw full-session dumps.
- Use `login: false`; no automatic graph rebuild per command. Update explicitly when needed. Missing graph coverage means incomplete analysis, not zero risk.
- Do not require unavailable Serena/Headroom/Context7 tools. Discover current tool metadata once and use source/official-doc fallback. MCP names and CLI subcommands are different interfaces.
- Check account usage at substantial-work boundaries, not constantly. It is account-wide; other threads contribute. No invented exact savings, unrequested paid tier or usage-reset redemption.
- Do not port Claude's unrelated auto-mode environment, broad permission lists or Unix shell hooks. Preserve source invariants while correcting outdated assertions about audit immutability, live streaming and fencing.
- Source/code evidence, rather than the oldest architecture memory, resolves conflicting docs.

## Completion
Code is complete when intended behavior, relevant checks, required security review, parent integration and handoff are complete. Plans need owners, dependencies, budgets, acceptance and go/no-go gates. A lead, reply, meeting, signed scope and payment are different commercial outcomes.

## Validation and limits
CLI observed: 0.153.4. Validate TOML/YAML/JSON, hook output, skill frontmatter, runner success/failure propagation and configuration loading without starting a paid model run. [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [hooks](https://learn.chatgpt.com/docs/hooks) document the selected settings. New config, skills, agents and hooks may require reopening the session. The local doctor currently loads Sol and the MCP configuration successfully; its overall failure is the existing Windows sandbox provisioning error plus a noninteractive terminal diagnostic. Do not copy credentials or disable protections to make those checks green.
