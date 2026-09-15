# Codex setup audit and acceptance
12 September 2026. Scope: Axon working setup, not product feature implementation.

## Findings and changes
| Observed issue | Applied response |
|---|---|
| 86 Claude project skills, including large interactive advisors; no Axon-local Codex skills | Added two concise Codex skills: axon-resume and axon-deliver. Existing Claude library retained on demand. |
| Global Codex PostToolUse graph update and SessionStart graph status use Bash syntax on Windows | Removed exactly those two hooks. Original preserved at C:\Users\Yash\.codex\hooks.json.pre-axon-20260912. No other hooks or credentials changed. |
| Global graph MCP working directory points to Yantra | Axon project config overrides cwd to C:\My Project\Axon. |
| Repeated full transcript reads, test reruns after interrupted reports, review of unfinished edits | Root instructions now require bounded retrieval, result recovery, evidence reuse and stabilized review checkpoints. |
| Claude rules require unavailable tools or mix CLI/MCP names | Tool discovery and source fallback replace a mandatory ladder. Current graph MCP tools do exist; an investigator's initial absence claim was rejected after checking live metadata. |
| Old audit/fencing/live-log claims contradict current source | Context checkpoint points to current tracker, accepted evidence and still-unimplemented execution-v2 contract. |
| Profile startup can index unrelated work | Non-login shell defaults, explicit login:false guidance. |
| No persistent command evidence with input identity | Added verification runner with compact summaries and local JSON/log records; validation below. |
| Sol should execute routine work while Astra protects high-risk decisions | Set Sol/high as the Axon default and added an explicit read-only architecture Astra role plus decision gates in AGENTS.md and the brain plan. |
| Long sessions can lose current state after resume or compaction | Added a fail-open SessionStart hook that injects only the bounded checkpoint and live tracker. |

## Installed files
- AGENTS.md, docs/AXON-CONTEXT.md, docs/codex/OPERATING-MODEL.md.
- .codex/config.toml, five .codex/agents/*.toml roles, and .codex/hooks.json with its PowerShell continuity script.
- .agents/skills/axon-resume and axon-deliver (including UI metadata).
- scripts/codex/axon-check.ps1 and its behavioral self-test.
- docs/codex/BRAIN-PLAN.md with the Sol execution loop and Astra escalation gate.
- Narrow .gitignore exceptions for shareable config/skills; diagnostics/evidence remain local.

## Verified so far
Six TOML files parsed successfully. Hook JSON parsed and the PowerShell hook returned valid SessionStart JSON capped at 6,500 characters. Both skills passed the bundled quick_validate.py validator. The host CLI doctor configuration check is OK, reports model gpt-5.6-sol for Axon, and reports auth, app-server handshake, network, Git and MCP configuration healthy. The overall doctor exits 1 because Windows sandbox provisioning reports helper_unknown_error and the noninteractive diagnostic has TERM= dumb, so it is not reported as globally green.

The Windows sandbox helper developed a setup-refresh error. A controlled check temporarily removed the new project config; the same error persisted, and the config was restored. Approved host execution remains usable. No sandbox policy, Defender setting or credential was weakened to bypass this. Codex 0.154.0 is available while 0.153.4 is installed; an application update is deferred because restarting or altering the active desktop runtime is separate from the repository setup.

Runner syntax parsed with 0 errors. Its behavioral self-test exited 0 with six assertions, covering Snapshot output, mocked npm native exit 7, failure-tail output, JSON exit preservation and frontend fail-fast. An independent rerun also exited 0. Snapshot evidence is local under .codex/evidence; no heavy application suite was rerun for this setup change. Agent mode covers local offline tests and clippy, not a Linux release build.

## Activation and rollback
New sessions load project config subject to app/thread overrides and project trust. Reopen a session if skills/agent definitions do not appear. This conversation uses explicit task briefs where the generic collaboration API cannot select named custom roles.

Rollback the two global hook changes by restoring the exact dated backup if desired. The project files are standalone and can be edited/reverted independently; no plugin was uninstalled and no dependency installation was required. The original Claude setup was left intact.

## Measurement
No token-saving percentage is claimed. The account snapshot at task start was 19% of the five-hour window and 3% of the weekly window used; Yash later reported that usage was reset. Account figures include all threads, so they are not attributed to this setup. Future evidence should compare accepted milestones, repeated reads and runs, elapsed time, and usage changes under comparable workloads.
