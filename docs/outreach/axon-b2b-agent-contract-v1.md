# Axon B2B outreach agent contract v1

Status: implemented local review pipeline. Three first-party service descriptions have been manually researched for a separate discovery-review packet; the code does not perform live research, contact resolution, approval, scheduling, or sending.

## Product decision

Axon should use a hybrid control system. Specialized reasoning roles may propose evidence normalization, account fit, a use case, and copy. Deterministic policy code alone decides whether an item advances. This is stronger than a free-running agent chain because commercial judgment benefits from specialized reasoning, while privacy, product claims, suppression, freshness, state transitions, and sending authority need rules that fail closed and can be tested.

The six names in this design are logical responsibilities with versioned contracts. They do not imply six long-running model processes. The current implementation is deterministic Python over supplied organization-level evidence. A later model adapter may implement a reasoning role only if it returns the same typed output and still passes the same policy gates.

## What the first slice does

Input is a manually prepared JSON file containing organization-level public evidence, a proposed qualification rubric, a role category, a use-case hypothesis, and fresh suppression status. Pipeline v3 produces an evidence-hold bundle: every structurally passing candidate stops at `AWAITING_EVIDENCE_REVIEW`, marked `SUPPLIED_UNVERIFIED`. The outward manifest has no recipients or drafts and pending approval; rejected items retain a reason code. No supplied reviewer field can bypass the hold.

The only approved capability sentence is:

> Axon maps one approved non-production procedure to an exact target and returns a reviewable evidence bundle.

The slice cannot browse, resolve a person, access a mailbox or provider, read credentials, approve, schedule, or send. The quarantined Desktop sender is not imported or called.

## Role contracts

Every role persists its `role`, `backstory`, `purpose`, `goal`, `task`, input contract, output contract, constraints, and acceptance checks in the resulting bundle.

| Role | Senior responsibility | Output | Gate that limits it |
|---|---|---|---|
| Research | B2B account research engineer | Structurally checked, dated source records; supplied evidence remains unverified | Rejects malformed, stale, contradictory, or personal inputs; does not authenticate sources |
| Qualification | Revenue operations and ICP analyst | Recomputed proposed five-dimension score, not buyer qualification | Fixed rubric and 7/10 structural threshold; semantic truth still requires independent review |
| Use-case | Solutions architect for operations teams | Proposed pain hypothesis, owner role, and capability ID | Checks supplied evidence references and known capability; does not establish actual pain or authority |
| Draft | Enterprise outbound copywriter | Ephemeral candidate subject and body used only for internal preflight | Uses supplied source records and capability ledger; no candidate draft is released by v3 |
| Critic | Adversarial messaging and claims reviewer | Internal preflight pass/fail findings | Checks configured claims/copy rules; does not establish semantic evidence quality |
| Verification | Evidence-hold bundle verifier | Checksum-bound evidence hold and empty pending manifest | Runs complete manifest/privacy/suppression preflight, discards recipients and drafts; cannot approve or send |

## State and authority model

```text
SUPPLIED_EVIDENCE
  -> RESEARCH_STRUCTURALLY_CHECKED
  -> PROPOSED_SCORE_CHECKED
  -> USE_CASE_SELECTED
  -> DRAFTED
  -> CRITIC_PASSED
  -> MANIFEST_PREFLIGHT_PASSED
  -> DISCARD_EPHEMERAL_RECIPIENT_AND_DRAFT
  -> AWAITING_EVIDENCE_REVIEW
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

27 September implementation checkpoint (independently accepted locally): pipeline v3 applies a fail-closed evidence hold after the complete candidate-manifest preflight. The local suite passes 61 tests, exit 0. The three known semantic-quality gaps remain unresolved evidence, not machine-qualified leads, and all structurally passing candidates are held. Historical v1/v2 artifacts remain unchanged and structurally verifiable only. Acceptance: `.codex/evidence/server-approval-20260927/architecture-outreach-review.md`; regression: `.codex/evidence/outreach-v3-regression.log`. A separate authenticated, evidence-bound review contract is required before releasing any recipient; that contract and sending are outside this slice. The numbered history below records the prior 26 September acceptance, not v3 acceptance.

1. DONE locally: schema-2 source capture records URL, source type, publication/retrieval times, verbatim excerpt, excerpt digest, and saved-text digest. It is read-only and has no browser/HTTP adapter; a human must still verify source authenticity and claim context.
2. DONE locally for research review: an unqualified discovery lane records first-party service-fit hypotheses and questions for three organizations without representing them as qualified leads. Its separate `axon_discovery_review` artifact remains `DISCOVERY_REVIEW_ONLY`; all execution capabilities are false, and qualified-artifact validators reject it. The excerpts were supplied manually and require human source review.
3. IN PROGRESS: publication-based trigger freshness, explicit contradiction rejection, and score-to-fact/use-case binding are implemented. A test-only labeled evaluation was independently accepted on 26 September: 11 synthetic cases, with 8 structural cases and 3 separately recorded semantic-quality gaps; the full local suite passes 53 tests and 30 subtests. Correctly typed but vague pain, team-existence buyer claims and service-offering assessment claims can still reach human review, so semantic qualification enforcement is not complete. Evidence: `.codex/evidence/outreach-quality-20260926.md` and `.codex/evidence/security-acceptance-20260926.md`. Next decide and implement fail-closed semantic evidence validation without treating public service fit as first-hand buying intent or contact permission.
4. Add an organization-level campaign review UI and immutable approval object bound to bundle checksum, reviewer, expiry, and exact items.
5. Design contact resolution and suppression as a separate privacy-reviewed service. Do not copy contacts or credentials from the Desktop sender.
6. Add a provider adapter only after independent security, legal/deliverability, sandbox, and canary acceptance. Sending must consume a still-valid approval and re-check suppression transactionally.

A successful current run proves only that supplied evidence can become a locally reviewable, policy-checked bundle. It does not prove live research quality, deliverability, legal eligibility, reply rate, or client acquisition.
