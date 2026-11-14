# Axon owner handoff — 7 October 2026

Read this first when continuing. The live tracker is [AXON-LIVE-TODO.md](AXON-LIVE-TODO.md); accepted source and execution evidence outrank plans and old chat summaries. This is not a production-readiness certificate.

## What you have

Axon lets an authorized teammate review and run a bounded operation on one explicitly chosen machine, then inspect saved evidence and prepare a sanitized handoff. Its most credible starting use case is a repetitive, low-risk Linux check currently dependent on one engineer. The product does not replace every monitoring, CI/CD or remote-management tool. Its proposed value is easier, controlled delegation of a specific existing procedure; that value still needs a buyer and second-operator test.

Locally accepted work includes authentication/tenant boundaries, exact targeting, server-bound preview/approval, run/attempt identity, truthful exit-code outcomes and UNKNOWN warnings, durable dispatch/journal recovery foundations, read-only saved-run inspection, a sanitized handoff, and a clearer responsive light/dark frontend with the canonical logo. Latest recorded frontend acceptance: 190 tests across 12 files, lint/build and 36 fixture-browser checks. Latest recorded backend regression: 362 passed, 7 skipped. These are recorded evidence, not a new full-suite run today.

The named staging-version operation is **an uninstalled example**. Its command/path must be validated for the actual approved environment. Reading a version file does not prove service health. An accepted or queued run is not a completed operation; UNKNOWN is not a confirmed failure and must not be blindly repeated.

## Current execution checkpoint

The real connected-agent approval/failure test remains open at this checkpoint. The previous isolated run stopped at an agent socket identity guard; its owned test resources were cleaned up. The never-started socket diagnostic also cleaned up successfully. The bounded running-agent diagnostic has 33 passing offline guards, native exit 0, but needs independent source GO and fresh runtime evidence. See `.codex/evidence/connected-agent-20261004/internal-runner-verification-r7.md` and `acceptance.md`; a later dated checkpoint below supersedes this paragraph only when supported by actual evidence.

Actual screen-reader and independent second-operator checks are NOT PERFORMED. Use [the prepared walkthrough](axon-human-validation-walkthrough-2026-10-04.md); mocks and accessibility-tree checks cannot replace them.

## Continue in this order

1. Finish the isolated connected-agent test: real preview, explicit approval, correlated success and intentional nonzero failure, saved results/replay checks, native exit 0 and complete owned/nested cleanup. Review actual failure evidence before changing anything. Never weaken an identity guard to get a green result.
2. Validate one harmless operation and let another authorized person use it without coaching. Run an actual screen-reader/keyboard/zoom walkthrough. Fix observed confusion before recording the demo.
3. Before customer installation, finish evidence-backed safe retry/target-hold reconciliation, live persistence-fault/process-crash checks, clean installation, backup/restore and real multi-host Linux validation. Retry and reconciliation require an agreed architecture/security contract first. [Restore rehearsal](axon-inert-restore-rehearsal-v1.md) is a design, not an executed backup test.
4. In parallel, seek permission for one buyer conversation. Show the narrow workflow, ask what they do now, how often, who waits, what it costs, why their current tools are insufficient, and who owns budget. Ask for a sanitized existing procedure and a permitted test environment; do not ask for production credentials.
5. Make a short truthful video after you have a reproducible demonstration. Offer a bounded integration-assisted pilot only after technical gates and buyer scope are agreed. Price from the validated burden and integration/support cost, not an invented market estimate.

## Commercial truth and your next human action

37 organizations have been source-reviewed; 0 qualified, 0 contacts resolved, 0 approved/sent emails, 0 clients. NEXOYA and earlier service-fit hypotheses are research leads, not buyers. The outreach adapter is not an autonomous internet discovery engine and remains review-only. Do not turn this list into a bulk email campaign.

Your best next action is to ask someone you can legitimately approach for a **workflow conversation**, not a purchase: “Do routine Linux checks ever wait for the one person who knows the procedure? I’m testing a tool for letting an authorized teammate run an approved check on a chosen machine and keep the result. Could you show me how you handle one today?” This is an optional human-use draft, not an approved message or permission to send it. If they already solve this cheaply and reliably, record that evidence and choose a different workflow; do not force Axon into it.

There is no defensible percentage-to-first-sale. Engineering test counts cannot measure buyer demand. You have a substantial locally tested core, but no validated buyer and several release gates; a first sale remains unproven. Avoid more generic features until one recurring workflow and willingness to pay are established.

## Resume prompt for another coding assistant

> Work in `C:\My Project\Axon`. Read `AGENTS.md`, `docs/AXON-CONTEXT.md`, `docs/AXON-LIVE-TODO.md` and this handoff first, then only active linked evidence. Preserve all unrelated dirty-tree edits. Follow the Axon resume/deliver/context-efficiency skills. Use the code graph first if it covers this repository; otherwise use targeted reads. Sol handles execution; Astra decides shared contracts/security-sensitive changes and independently accepts stabilized work. One writer per file. Recover interrupted commands before rerunning and retain actual native exits, source hashes, counts and limitations. Prioritize the next unaccepted gate, not another redesign. Local isolated Docker testing is authorized, but no customer deployment, publication, external messaging, credential changes, Docker prune or unrelated resource deletion. Backend tests delete collections: use only isolated disposable MongoDB, check Redis, and never use a customer database. Do not retry UNKNOWN work. Update the tracker only with truthful evidence.

## Local checks and boundaries

From the repository in PowerShell without profiles:

```powershell
Set-Location 'C:\My Project\Axon'
node --test scripts/codex/approval-connected-agent.guard.test.mjs scripts/codex/approval-connected-agent-runner.guard.test.mjs
```

The full connected-agent entry point is `node scripts/codex/approval-connected-agent-orchestrator.mjs`, **not** the legacy adapter or inert PowerShell wrapper. Run it only after independent GO at frozen inputs. It uses the explicit local `desktop-linux` daemon, fresh labelled resources, an internal network and disposable fixture data; it is not a persistent demo environment. Keep its native exit, runtime JSON and cleanup ledger. A failed report is evidence, not authorization for broad cleanup or blind reruns.

Frontend checks from `frontend`: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`. Use `scripts/codex/axon-check.ps1` where applicable after reading its safety constraints; do not infer release readiness from a snapshot. Keep logs bounded in chat and full evidence under `.codex/evidence/`. Save the entire project and evidence before changing machines; never reset the dirty tree to make handoff easier.
