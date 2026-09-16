# Axon pre-send approval checklist

This is a human approval record for a future, limited outreach batch. It is not approval by itself. Every external action is **PENDING APPROVAL** until Yash completes the record and any required Astra/security/compliance gate is accepted.

## Batch identity

```text
batch_id:
profile: axon_b2b (must be isolated from Desktop Outreach)
prepared_at:
planned_channel:
planned_send_window:
manifest_path:
manifest_sha256:
message_version:
expiry:
operator:
```

## Yash’s required review

- [ ] I verified each organization, public business route, and observed date from the cited source.
- [ ] I selected a legitimate business recipient route and confirmed the country and recipient entity category; I did not guess a personal address or use purchased/scraped data.
- [ ] Each account has a current score and no exclusion. The score is based on evidence of a repeated procedure, cost/failure or evidence burden, buyer route, alternative gap, and safe synthetic/non-production path.
- [ ] Each personalized claim has a source and is true as of review. Unknown pain, size, budget, incidents, outcomes, and permissions remain unknown.
- [ ] The message uses Yash’s truthful identity and business contact details, accurate subject/header, no fake reply/thread presentation, no false urgency, and one clear question.
- [ ] The message describes the current offer honestly: INR 10,000 paid Automation Reliability Assessment, defined deliverables, and supervised synthetic/non-production scope where authorized. It does not promise production readiness, exactly-once execution, scheduling, automatic recovery, or live-log behavior that has not passed a gate.
- [ ] Required address, disclosure, opt-out, and channel/jurisdiction wording has been reviewed for the actual recipient. Replying “no” or an equivalent objection will suppress the route promptly.
- [ ] Global suppression, prior objections, bounces, complaints, replies, and duplicate records were checked immediately before approval.
- [ ] The exact recipient, channel, subject/body version, provenance, planned time, and content hash match the manifest I am approving.
- [ ] I understand approval expires at the recorded time and any edit, recipient change, or channel change invalidates it.
- [ ] I approve at most 10 new cold touches for this batch and understand follow-ups require provider delivery evidence and eligibility.

Yash approval: ____________________  Date/time (IST): ____________________

## Astra / security / compliance gates

- [ ] Astra accepted the product claims and current technical boundary for this message version.
- [ ] Any future `axon_b2b` implementation has passed the applicable isolation, dry-run, suppression, idempotency, provider-event, redacted-log, and kill-switch gates.
- [ ] Sender/domain authentication, SPF/DKIM/DMARC alignment, TLS, forward/reverse DNS, provider behavior, and reply/bounce monitoring were checked for the actual sender.
- [ ] The actual jurisdiction and channel review is complete. Legal/compliance status and retention are recorded; this checklist is not a legal determination.

Astra/security reviewer: ____________________  Decision/date: ____________________

## Send and reconciliation record (fill only if approved)

```text
manifest_item_id:
provider_message_id:
provider_accepted_at:
delivered_at:
bounced_or_deferred:
replied:
opted_out_or_complained:
suppressed_at/reason:
next_eligible_action/date:
reconciled_by/date:
```

Do not mark an item `sent` without a provider-accepted ID and timestamp. Do not follow up after a reply, bounce, complaint, opt-out, suppression hit, expired approval, or unresolved provider state. Pause the batch immediately on wrong recipient, PII leak, misleading claim, authentication/alignment failure, suppression defect, duplicate provider request, or any complaint.

## Explicitly out of scope

No Desktop Outreach daemon, legacy `.env`, recruiting workbook, mailbox, provider account, auto-DM, SMS/call, bulk upload, deployment, or campaign send is authorized by this document.
