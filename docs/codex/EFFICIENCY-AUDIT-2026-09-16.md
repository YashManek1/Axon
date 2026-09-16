# Axon Codex efficiency audit — 16 September 2026

Scope: reversible Codex context and command-output efficiency for the Axon workspace, plus the global Codex output cap. No product source, credentials, plugins or external services were changed.

## Applied changes

- `.codex/config.toml` keeps Axon command outputs at `3000` stored tokens and sets `model_auto_compact_token_limit = 64000` with `model_auto_compact_token_limit_scope = "total"`. The compaction threshold is explicit for the Axon `gpt-5.6-sol` setup; it can be revisited if the model or context window changes.
- `.codex/hooks.json` lowers the SessionStart handler's `additionalContextLimit` from `7000` to `2000` tokens.
- `.codex/hooks/session-context.ps1` keeps the stable context and emits only tracker rows marked `TODO`, `IN PROGRESS` or `BLOCKED`; completed history remains in the source tracker. Its hard output cap is `5600` characters.
- `.agents/skills/axon-context-efficiency/` adds a concise, discoverable workflow for bounded retrieval, evidence reuse and cost-aware delegation.
- Global `C:\Users\Yash\.codex\config.toml` adds `tool_output_token_limit = 4000`. The prior file is preserved as `config.toml.pre-20260916-efficiency`.

## Measurement

The SessionStart hook was measured with `{}` on unchanged source files:

| Measure | Before | After | Change |
|---|---:|---:|---:|
| Hook additional context | 6,500 chars (~1,625 tokens) | 5,391 chars (~1,348 tokens) | 1,109 chars (~17.1%) |
| SessionStart handler limit | 7,000 tokens | 2,000 tokens | 5,000-token ceiling reduction |

The approximation uses four characters per token and is only a planning estimate. Account rate-limit usage is shared across threads, so no account-level savings percentage is claimed.

## RTK assessment

RTK (Rust Token Killer) is a third-party Rust CLI proxy that filters common command output before it reaches an agent. The public repository documents command rewriting, a Codex integration option and estimated 60–90% output reduction; its own contributing guidance says those figures measure Bash output, not billing. Sources: [RTK repository](https://github.com/rtk-ai/rtk), [RTK savings explanation](https://github.com/rtk-ai/rtk/blob/develop/docs/guide/resources/savings-explained.md).

RTK is already present at `C:\Users\Yash\scoop\apps\rustup-msvc\current\.cargo\bin\rtk.exe`, version `0.42.2`, SHA-256 `92E333A50A387000B513471DC4FF14A64B5D39A7006E3CEF9368DCFF7B48A15B`. Its read-only `rtk gain` report shows 8,851 recorded commands, 12.9M estimated input tokens, 6.1M output tokens and 6.9M estimated tokens saved (53.6%) across global history. This is historical RTK telemetry, not a before/after Axon experiment.

No RTK installation, hook initialization or Codex interception was performed. It remains deferred because it is third-party, its hook would add another command-rewrite layer on Windows, and native Codex bounds plus evidence files already address the highest-confidence Axon waste. Reconsider only after a source/security review and a matched Axon command-output benchmark.

## Validation evidence

Recorded in `.codex/evidence/20260916-efficiency-validation.txt`:

- `hooks.json` JSON parse passed.
- PowerShell parser reported zero errors for `session-context.ps1`.
- Valid hook input exited 0, returned JSON, included actionable rows and stayed at 5,391 context characters.
- Malformed hook input exited 0 (fail-open continuity behavior).
- Bundled skill quick validator passed (`Skill is valid!`, exit 0).
- `codex doctor --summary --json` loaded configuration, auth and MCP successfully. It exits 1 only because the existing elevated Windows sandbox provisioning check and noninteractive `TERM=dumb` diagnostic remain unresolved; no protection or credential was changed.

New settings and skill files may require reopening the Codex session. Rollback copies are retained for the project config/hook files as ignored `.pre-20260916-efficiency` files; the hook script copy is under `.codex/evidence/session-context.ps1.pre-20260916-efficiency`. Roll back the global cap by restoring `C:\Users\Yash\.codex\config.toml.pre-20260916-efficiency`.