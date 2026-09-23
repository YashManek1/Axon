# Axon B2B outreach agent contract v1

Status: implemented local review pipeline. No live research, contact resolution, approval, scheduling, or sending.

## Product decision

Axon should use a hybrid control system. Specialized reasoning roles may propose evidence normalization, account fit, a use case, and copy. Deterministic policy code alone decides whether an item advances. This is stronger than a free-running agent chain because commercial judgment benefits from specialized reasoning, while privacy, product claims, suppression, freshness, state transitions, and sending authority need rules that fail closed and can be tested.

The six names in this design are logical responsibilities with versioned contracts. They do not imply six long-running model processes. The current implementation is deterministic Python over supplied organization-level evidence. A later model adapter may implement a reasoning role only if it returns the same typed output and still passes the same policy gates.

## What the first slice does

Input is a manually prepared JSON file containing organization-level public evidence, a qualification rubric, a role category, a use-case hypothesis, and fresh suppression status. The pipeline produces a checksum-addressed review bundle. A passing item stops at `AWAITING_HUMAN_APPROVAL`; rejected items retain a reason code.

The only approved capability sentence is:

> Axon maps one approved non-production procedure to an exact target and returns a reviewable evidence bundle.

The slice cannot browse, resolve a person, access a mailbox or provider, read credentials, approve, schedule, or send. The quarantined Desktop sender is not imported or called.

## Role contracts

Every role persists its `role`, `backstory`, `purpose`, `goal`, `task`, input contract, output contract, constraints, and acceptance checks in the resulting bundle.

| Role | Senior responsibility | Output | Gate that limits it |
|---|---|---|---|
| Research | B2B account research engineer | Normalized, dated, sourced organization evidence | Rejects missing, stale, unverifiable, or personal evidence |
| Qualification | Revenue operations and ICP analyst | Recomputed five-dimension score | Fixed rubric and 7/10 threshold; no model discretion |
| Use-case | Solutions architect for operations teams | One pain hypothesis, owner role, and capability ID | Requires supporting evidence and a known capability |
| Draft | Enterprise outbound copywriter | One concise subject and body | May use only verified evidence and the capability ledger |
| Critic | Adversarial messaging and claims reviewer | Pass/fail findings | Rejects unsupported, inflated, vague, long, or pushy copy |
| Verification | Campaign release engineer | Checksum-bound item for human review | Re-runs manifest/privacy/suppression gates; cannot approve or send |

## State and authority model

```text
SUPPLIED_EVIDENCE
  -> RESEARCH_VERIFIED
  -> QUALIFIED
  -> USE_CASE_SELECTED
  -> DRAFTED
  -> CRITIC_PASSED
  -> VERIFIED
  -> AWAITING_HUMAN_APPROVAL
```

Any failed gate produces `REJECTED`; there is no transition to approved, scheduled, or sent. Suppression overrides qualification. Per-item manifest preflight prevents a batch wrapper from hiding personal contact data, unknown jurisdiction, stale consent/suppression state, placeholders, or forbidden claims. Canonical JSON and SHA-256 make later changes visible; exclusive creation makes an existing artifact write-once.

## Commercial method

Use SPIN and Jobs-to-be-Done to form a testable pain hypothesis and discovery question. Use MEDDICC-style fields to judge whether the account has a measurable problem, an owner, a decision process, and a plausible paid assessment. These frameworks shape hypotheses; they never turn inference into evidence. Copy follows a simple structure: one verified trigger, one cautious implication, one exact capability, one low-friction question, and an opt-out.

The first offer is a paid, non-production execution assessment. The buyer is a platform, operations, or security leader who owns recurring procedures across machines and needs controlled execution with reviewable evidence. Axon is not sold as general autonomous automation in this phase.

## Compliance and deliverability boundary

Provider and legal requirements belong in a future sender gate, not inside drafting. Before any provider adapter exists, the release design must cover authenticated domains, honest headers and subjects, sender identity and postal information where required, opt-out processing, suppression before every send, provider rate/reputation controls, and jurisdiction/entity rules. Primary references:

- Google bulk sender guidelines: https://support.google.com/mail/answer/14229414
- Yahoo sender best practices: https://senders.yahooinc.com/best-practices/
- FTC CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide
- UK ICO business-to-business marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- RFC 8058 one-click unsubscribe: https://www.rfc-editor.org/rfc/rfc8058

Local review artifacts do not establish that an account may lawfully or appropriately be contacted. That decision requires jurisdiction-aware review and a separately approved recipient batch.

## Next implementation slices

1. Add read-only source adapters that capture URL, publication time, retrieval time, excerpt hash, and source type. Keep browsing isolated from pipeline policy.
2. Add evidence contradiction and staleness checks, then evaluate research quality on a labeled synthetic set.
3. Add an organization-level campaign review UI and immutable approval object bound to bundle checksum, reviewer, expiry, and exact items.
4. Design contact resolution and suppression as a separate privacy-reviewed service. Do not copy contacts or credentials from the Desktop sender.
5. Add a provider adapter only after independent security, legal/deliverability, sandbox, and canary acceptance. Sending must consume a still-valid approval and re-check suppression transactionally.

A successful current run proves only that supplied evidence can become a locally reviewable, policy-checked bundle. It does not prove live research quality, deliverability, legal eligibility, reply rate, or client acquisition.
