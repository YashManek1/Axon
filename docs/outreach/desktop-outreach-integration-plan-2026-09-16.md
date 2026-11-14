# Desktop Outreach boundary and integration plan

Prepared 16 September 2026. This document defines a future, reviewable adapter boundary. It does not authorize running the Desktop tool, reading its live data, importing contacts, or sending messages.

## Observed boundary

The requested path `C:\Users\Yash\Desktop\outreach` was not present when checked read-only on 16 September 2026. The actual legacy tool at `C:\Users\Yash\OneDrive\Desktop\Outreach` was then verified with a read-only top-level inventory. It contains code and configuration entry points (`README.md`, `config.yaml`, `main.py`, `run_daemon.py`, `requirements.txt`, `.env`, and `.env.example`) plus `outreach` and `output` directories and recruiting-era PDFs, spreadsheets, resume, contact, and job-tracker artifacts. Only names and filesystem metadata were inspected. The `.env`, workbooks, resumes, contact records, logs, mailbox/provider state, and file contents were not opened. This confirms that the legacy tool must remain quarantined from Axon sales work.

Earlier planning evidence reports settings including `dry_run=false`, `send_immediately=true`, a 450 cap, and a five-minute schedule, plus incomplete reply/bounce/suppression/unsubscribe handling, broad SMTP retries, weak follow-up guards, recruiting/resume/workbook fields, and personal-data logs. Those reported values remain historical quarantine evidence; they were not re-read from live configuration during this review.

Do not start its daemon, open its `.env`, read contact workbooks or resumes, share its database, reuse its sender credentials, or copy its logs. Do not “fix” it in place. It is not an Axon sales system.

## Hard separation

The future profile is `axon_b2b`, with a separate database/collection namespace, configuration root, log sink, provider identity, suppression store, and runtime process. The adapter may reuse generic drafting/scoring ideas only after review. It may never load recruiting prompts, resumes, job records, legacy schedules, or legacy recipients.

The data flow is one-way and explicit:

```text
approved public business research
        -> human-reviewed Axon account/contact record
        -> claim/compliance/suppression validation
        -> immutable batch manifest + Yash approval
        -> dry-run artifact (default)
        -> [future separately approved provider adapter]
        -> provider events -> Axon funnel/CRM
```

There is no shared database, filesystem watch, mailbox, `.env`, token, schedule, or implicit “sent” callback between the legacy tool and Axon. The legacy tool has no read or write path into `axon_b2b`.

## Contract for a future adapter

The adapter accepts only versioned Axon records with organization-level provenance and a verified public business route. Required input includes `account_id`, organization/domain, source URL and observed date, candidate buyer role/route, jurisdiction/entity category, score/reasons, exclusions, claim ledger, message version, suppression result, manifest hash, approver, expiry, and planned channel/time. Unknown values remain `unknown`; the adapter must reject missing required facts rather than infer them.

The adapter emits only a dry-run artifact until all gates pass. A future provider mode would require a provider-accepted message ID and timestamp before `sent`; a queue item, local render, SMTP attempt, or dry-run cannot become `sent`. Provider events must be append-only and include accepted/delivered/deferred/bounced/complained/replied/unsubscribed states. A reply, bounce, complaint, opt-out, suppression hit, expired approval, changed content hash, or changed recipient invalidates follow-up eligibility.

Forbidden inputs and outputs:

- recruiting prompts, resumes, personal contact enrichment, purchased/scraped lists, or sensitive personal attributes;
- arbitrary shell commands, unattended production execution, or any Axon claim that has not passed its technical gate;
- fake `Re:`/`Fwd:`, guessed names or email addresses, bulk fan-out, automatic cross-channel duplication, or follow-ups based only on a timer/open;
- plaintext credentials, full message bodies in broad logs, or unredacted personal data retained beyond the approved period.

## Staged implementation and acceptance

| Stage | Allowed behavior | Required evidence before advancing |
|---|---|---|
| 0 — quarantine (current) | No daemon, provider, legacy data, or external action. Documentation and isolated schemas only. | A test or review proves legacy config/schedules cannot load into `axon_b2b`; no sender credential is shared. |
| 1 — dry-run | Import only manually prepared Axon records; render drafts and a manifest; `dry_run=true` enforced in code and config. | Tests reject missing provenance, unresolved placeholders, forbidden claims, wrong jurisdiction/entity, opt-out/suppression hits, and any transition from dry-run to `sent`. |
| 2 — immutable approval | Freeze exact recipient, channel, subject/body version, planned time, expiry, claim ledger, and content hash. | Duplicate invocation reserves the same idempotency key and makes no second provider request; any mutation invalidates approval. |
| 3 — provider events | Accept provider IDs/events and maintain global suppression, redacted logs, and reconciliation. | Failure injection proves no false `sent`, no follow-up after reply/bounce/opt-out, and no broad retry of permanent/ambiguous failures. |
| 4 — limited sending | Only after independent Astra security review, sender/compliance readiness, manual kill switch, and Yash’s batch approval. | At most 10 new cold messages/day; any complaint, auth/alignment, suppression, idempotency, wrong-recipient, or PII defect pauses the path. |

Stages 1–4 are **PENDING APPROVAL** and require a separate implementation authorization. The current plan authorizes planning only.

## Operational handoff

Yash owns the research record, recipient decision, message approval, send decision, replies, proposals, payment/PO, and suppression. Astra owns product claims, security review, and acceptance of any shared execution or sending contract. The operator must be able to disable the provider path with one manual kill switch and reconcile every provider ID to exactly one manifest item. Any uncertainty is recorded as `unknown` and escalated; it is not converted to success.

## Checklist before any adapter work

1. Confirm the legacy path is quarantined and no `.env`, mailbox, workbook, schedule, or daemon is accessed.
2. Obtain explicit implementation authorization and agree the Axon schema/contract with Astra before shared integration changes.
3. Create separate profile/database/config/log/suppression boundaries and prove cross-load is impossible.
4. Implement dry-run validators and meaningful failure-injection tests before a provider connector exists.
5. Prepare a tiny synthetic fixture set; never test with customer or prospect data.
6. Record the security/compliance decision, retention period, kill-switch procedure, and owner.

No connector, import, provider account, schedule, or campaign is active as a result of this document.
