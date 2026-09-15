# Axon first-client and funnel plan

Updated 12 September 2026. Owner: Yash. Product, claims, security and final acceptance: Astra.

This is a **plan-only** commercial operating document. No message was sent, no campaign or daemon was started, and no mailbox, `.env`, contact workbook, or customer system was accessed. Buyer action cannot be guaranteed. The 48-hour sprint creates a qualified pipeline and concrete asks; it cannot promise a client by a deadline.

Technical scope and claims must match the [Axon context](AXON-CONTEXT.md), [live tracker](AXON-LIVE-TODO.md), [technical completion plan](axon-technical-completion-plan-2026-09-12.md), [current product plan](axon-current-product-plan-2026-09-09.md), and [execution contract](axon-execution-contract-v2.md).

## Commercial decision

Sell a **paid Automation Reliability Assessment** before selling software.

| Offer | Price and commitment | Deliverable |
|---|---|---|
| Reliability Assessment | INR 10,000 paid upfront | 60-minute procedure review, current-state evidence map, failure/risk analysis, one supervised synthetic or non-production demonstration where authorized, and a one-page recommended scope |
| Founding pilot | INR 30,000; assessment fee credited, leaving INR 20,000 | One named organization, environment, procedure, approved targets, installation/acceptance plan, and staffed pilot only after technical G1 |
| Ongoing hypothesis | INR 6,000/month after accepted pilot | Bounded support/maintenance for the agreed scope; validate burden and willingness to pay before treating it as a product price |

A **real client** exists only when all five facts exist: named organization, named buyer, written scope, booked delivery date, and cleared payment or binding purchase order. A lead, reply, meeting, verbal yes, proposal, unpaid trial, or demo attendee is not a client.

The assessment is valuable even if Axon is not recommended. Yash sells a diagnosis and decision, then earns the right to propose the pilot.

## Ideal customer and positioning

Primary buyer: founder, CTO, infrastructure lead, or delivery lead at a 3–15 engineer DevOps agency, managed-service provider, or product agency that repeatedly runs Linux procedures across customer or internal environments. A fit has direct budget authority or access, a recent repeated runbook, and an authorized synthetic or non-production path.

Exclude enterprises with procurement/security lead times incompatible with a founder-led pilot; regulated or sensitive production workloads; teams demanding unattended production use, HA, an SLA, arbitrary remote shell, broad integrations, or fleet-scale orchestration now; and organizations unwilling to authorize a safe non-production exercise.

Positioning sentence: **Axon helps a small infrastructure team supervise an approved procedure on the exact non-production target, bind it to an explicit approval, and preserve an honest result or recovery decision.**

The current alternative is SSH plus scripts, cron, CI jobs, Ansible, cloud run-command tools, or a general automation platform plus manual evidence. Axon’s proposed value is control and evidence around a bounded operator action. Never claim production readiness, exactly-once effects, immutable audit, generally live logs, scheduling, automatic recovery, or capabilities that have not passed the relevant release gate.

The approach follows the founder-led, hands-on acquisition logic in Paul Graham’s [Do Things that Don’t Scale](https://paulgraham.com/ds.html), behavior-based learning from [The Mom Test](https://www.momtestbook.com/), and a specific best-fit/alternative/value frame from [April Dunford](https://www.aprildunford.com/). Sales conversations must stay rooted in present deliverable value and leave room for discovery, consistent with [Sales-First Storytelling](https://aprildunford.substack.com/p/sales-first-storytelling).

## Funnel system of record

Use one small table or database; do not treat an email-sending log as the CRM.

| State | Entry evidence | Required next action |
|---|---|---|
| `sourced` | Organization and provenance URL/referral | Research current evidence |
| `researched` | Fit facts, exclusion check, 10-point score | Identify legitimate buyer/contact route |
| `qualified_account` | Score threshold and safe path | Draft a claim-grounded approach |
| `contact_verified` | Role, public/business route, jurisdiction/entity category | Run claim, placeholder and compliance checks |
| `draft_ready` | Complete draft and claim ledger | Human review |
| `approved_to_send` | Named approver and exact batch-manifest hash | Manual/provider send only in an accepted sending stage |
| `sent` | Provider accepted message ID and timestamp | Wait; do not infer delivery |
| `delivered` | Provider event | Await reply; follow up only if eligible |
| `replied_positive` | Actual reply indicating relevance | Book discovery |
| `replied_negative` | No fit / no interest | Close or suppress as requested |
| `discovery_booked` | Calendar date and named attendee | Prepare past-behavior questions |
| `discovery_complete` | Notes, problem evidence, authority, safe path, next action | Qualify or close |
| `assessment_proposed` | One-page scope, INR 10,000, expiry, booked-date choices | Ask for payment/PO |
| `assessment_won` | Cleared payment or binding PO plus all client fields | Deliver assessment |
| `pilot_proposed` | Assessment evidence and G1-dependent written scope | Buyer decision |
| `pilot_won` | Signed scope, booked date, cleared payment/PO, G1 passed | Staffed delivery |
| `nurture` | Fit exists but timing absent; permission/next review date | One agreed future action |
| `lost` | Reason and alternative chosen | Learn; no automatic follow-up |
| `bounced` / `opted_out` / `suppressed` | Provider event, request, complaint, legal/policy block | Terminal no-send across campaigns |

Required fields: `account_id`, organization/name/domain/geography/size band, segment, source/provenance URL and observed date, evidence quote or paraphrase, candidate runbook, current alternative, score with reasons, exclusion reason, buyer name/role and public business route, referral source, jurisdiction and recipient entity type, lawful/compliance basis status, last verified date, claim ledger, placeholder check, message version, batch manifest/hash/approver, provider/message IDs, delivery/bounce/reply/opt-out events, suppression status/reason, every state timestamp, owner, next action/date, discovery facts, scope/version, price, payment/PO state, delivery date, and loss reason.

Do not fill unknown facts by inference. Keep them `unknown` and ask during discovery.

## Ten-point account score

Score evidence, not enthusiasm. A warm introduction changes the route, never the score.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Repeated procedure | No evidence | Plausible from current services | Recent named/repeated Linux runbook |
| Cost or failure pain | None | Qualitative friction | Measured time, delay, error, incident, or people waiting |
| Buyer access and budget | No route | Influencer/contact route | Named budget owner or direct introduction |
| Current alternative gap | Adequate incumbent/no concern | Workaround or mixed satisfaction | Recent failure, manual evidence, rerun, or explicit search for change |
| Safe assessment path | Production/regulated only | Permission uncertain | Authorized synthetic/non-production target and owner |

Cold outreach threshold: 7/10 with no exclusion. Warm discovery threshold: 6/10 or a referrer who can validate the missing facts. A score below threshold stays research/nurture. Any production-only, regulated, unattended-now, or no-permission signal overrides the numeric score.

## Exact 48-hour sprint

The sprint runs **Saturday 12 September 2026, 20:00 IST through Monday 14 September 2026, 20:00 IST**. Most buyers will not act on the weekend, so Saturday/Sunday create reviewed assets and warm paths; Monday provides the main buyer-hour block. Responses after 20:00 belong to follow-through, not rewritten sprint results.

### Saturday 20:00–23:00 — offer and evidence

- Freeze the assessment one-pager: buyer problem, exact deliverables, exclusions, INR 10,000 upfront, credit to pilot, two delivery-date options, expiry, and no production-readiness claim.
- Build the CRM schema/states above and claim ledger. Prepare the demo narrative using only implemented or explicitly labeled in-development behavior.
- Define 25 account slots and populate verified public evidence, date, candidate buyer, candidate runbook, current alternative, and score. No guessed personal email.
- Acceptance: one reviewed offer, system-of-record template, exclusion checklist, and at least 10 researched accounts.

### Sunday 08:00–13:00 — complete 25-account mix

Use this fixed portfolio:

| Accounts | Mix | Intended route |
|---:|---|---|
| 5 | ICP accounts with a real warm path through a colleague, client, community, vendor, or founder | Ask the connector for a specific introduction |
| 8 | 3–15 engineer DevOps agencies/MSPs with current Linux/managed-ops evidence | Individually reviewed cold email or contact form |
| 5 | Product agencies with managed hosting/support and repeated environment work | Individually reviewed cold email/LinkedIn |
| 4 | Current public-demand signals: explicit operations/runbook/service requests from ICP-sized firms | Respond to the stated need without platform pitching |
| 3 | Referral/learning partners serving the same ICP | Ask for a pattern interview or named referral; track separately from buyer conversion |

- Rank the 17 direct cold-capable buyer accounts by score, evidence recency, and buyer access. Select no more than 10 for a possible first touch; keep the rest researched.
- Acceptance: 25 accounts total, five credible warm paths, at least 10 accounts scoring 7+, every selected claim tied to provenance.

### Sunday 14:00–18:00 — drafts and safety review

- Draft five warm introduction requests and no more than 10 individualized cold approaches. Prepare LinkedIn variants only where that is the legitimate route; never duplicate channels simultaneously.
- Run human placeholder, identity, claim, recipient, jurisdiction/entity, opt-out/suppression, and tone review. Reject invented pain, scraped/private data, fake `Re:`/`Fwd:`, false urgency, and product claims beyond the current gate.
- Create one manifest containing exact recipient, channel, subject/body version, provenance, claim ledger, suppression result, planned time, and content hash. Approval is for that immutable manifest only; any change invalidates approval.
- Acceptance: zero unresolved placeholders or unsupported claims; no send automation armed; all drafts are individually reviewable.

### Sunday 18:00–Monday 09:00 — buyer-hour preparation and rest

- Rehearse the 20-minute discovery/demo and prepare one-page proposal fields, payment route, receipt/invoice process, two assessment date options, and calendar availability.
- Prepare response branches for interest, referral, incumbent-tool fit, security concern, timing, no interest, and opt-out. Responses remain personal and must answer what the person said.
- Verify sender identity/domain, SPF/DKIM/DMARC alignment, TLS/provider behavior, visible sender/contact details, suppression process, and reply/bounce monitoring before any future email approval.
- Acceptance: Yash can complete a live call, issue the scope, record payment/PO, and suppress a contact without using the legacy Outreach daemon.

### Monday 09:00–19:00 — manual buyer actions

- Ask the five warm connectors first. Make individually approved cold first touches only to the selected top accounts, respecting a total maximum of 10 cold touches and channel/jurisdiction rules.
- Respond to live replies within buyer hours; book 20-minute discovery rather than sending a broad deck. Offer two concrete times. Send a proposal only after qualification.
- At 19:00 stop new outreach. Use the final hour to freeze sent/delivered/reply facts, bookings, proposals, payment/PO, unknowns, and next dated action. Do not mark queued, dry-run, or SMTP-attempted records as sent.
- Acceptance: complete evidence for all 25 accounts and every action; a real client only if the strict five-part definition is met.

## Outreach templates

Every message uses Yash’s real identity and business contact, one verified observation, a single question, and the required sender/opt-out details for the channel and jurisdiction.

**Warm introduction request**

> Hi [Connector] — I’m offering a paid Automation Reliability Assessment for small infrastructure teams that repeat Linux procedures across environments. I review one recent run, its exact target, approval, result evidence, and recovery steps; the fee is INR 10,000. You mentioned [grounded context]. Would you be comfortable introducing me to [Name/role] at [Organization] if this matches work they actually handle? No worries if it does not.

**Cold email / contact form**

Subject: `[observed procedure or service] at [Organization]`

> Hi [Name] — I saw [one verified fact and source context]. When your team last ran a recurring Linux procedure across client or non-production environments, how did you verify the exact target and preserve the result when it failed or timed out? I offer a INR 10,000 Automation Reliability Assessment: one procedure review, failure/evidence map, and a bounded supervised non-production demonstration where authorized. Axon itself is still under technical completion, so this is not an unattended-production offer. Is a 20-minute review of the last real run relevant? [Real sender/contact/postal details where required.] If you prefer no further email, reply “no” and I will stop.

**LinkedIn**

> Hi [Name] — your work on [verified fact] caught my attention. I’m interviewing small infrastructure teams about the last time a repeated Linux procedure ran on the wrong target, failed unclearly, or needed a manual evidence trail. Would a 20-minute review of one past non-production example be useful? I can explain the paid assessment if the problem is real.

**Follow-up 1 — four business days after confirmed delivery**

> Hi [Name] — one concrete example is a team rerunning an approved check but being unable to tie the output to the exact server and attempt. Did that occur in any recent delivery, or is your current tooling already sufficient? If sufficient, I’ll record that and close the loop.

**Follow-up 2 — six business days later**

> Hi [Name] — I’ll close this after this note. If one repeated non-production runbook still consumes engineer time or produces unclear recovery evidence, I can scope the INR 10,000 assessment around that exact case. Otherwise no reply is needed, and I will not follow up again.

Follow-ups are allowed only when the first message has a provider ID and delivery evidence, and there is no reply, bounce, complaint, suppression, or opt-out. Never send both follow-ups at once or through a second channel.

## Discovery, demonstration, and close

Ask about specific past behavior, not compliments or imagined future intent:

1. “Take me through the last time this procedure ran, from trigger to verified result.”
2. “Which exact machine/environment was intended, and how did the operator prove it?”
3. “Show me the checklist, ticket, command, or evidence you used, with secrets removed.”
4. “Who performed it, who waited, and how many active minutes and elapsed hours did it consume?”
5. “What failed or became uncertain? What did you do next, and what was repeated?”
6. “How often did this happen in the last month or quarter?”
7. “What tool or process do you use now, and why has the team kept it?”
8. “What changed the last time you evaluated another approach?”
9. “Who authorizes access to a synthetic/non-production environment? What is prohibited?”
10. “Who owns the budget, and what happened the last time you bought a small reliability engagement?”
11. “What date would this need to be useful, and what existing commitment would make it real?”

Qualification requires: ICP/no exclusion, recent repeated behavior, meaningful cost/risk, current-alternative gap, named buyer, INR 10,000 authority/path, authorized safe environment, and a dated next step. Close weak conversations rather than forcing a demo.

**20-minute meeting:** minutes 0–3 confirm the last real run and agenda; 3–8 quantify trigger/target/evidence/failure/recovery; 8–14 show the bounded synthetic flow (exact target, approval, honest success/failure/unknown) with limitations visible; 14–17 map only proven fit to their procedure; 17–20 offer the assessment and two delivery dates. Do not use a roadmap as proof.

**One-page proposal:** organization/buyer, last observed procedure and baseline, assessment question, exact deliverables, authorized environment/data, exclusions, customer responsibilities, evidence and acceptance checks, INR 10,000 upfront, credit toward INR 30,000 pilot, two dates, expiry, cancellation/refund terms, confidentiality/data handling, named owners, and signatures/payment or PO route.

Close with: “If this scope matches the procedure and safety boundary, choose [date A] or [date B] and complete the INR 10,000 payment or binding PO. I will then book the assessment and send the evidence checklist.” Record a win only after funds clear or the PO binds.

## Legacy Outreach quarantine and future `axon_b2b` profile

`C:\Users\Yash\OneDrive\Desktop\Outreach` is a job/internship tool, not a safe Axon sales system. Its live configuration has `dry_run=false`, `send_immediately=true`, a 450 cap, and a five-minute schedule. A dry-run success can appear sent. It lacks complete reply, bounce, suppression, and unsubscribe handling; retries SMTP failures too broadly; and follow-ups omit reply/bounce/suppression, daily-cap, and maximum-follow-up guards. Recruiting prompts, resumes, and workbooks are the wrong data model. Logs expose personal data.

Do not run its daemon, read or use its `.env` or contact workbooks, import contacts, or retrofit a live campaign during this plan. Reuse only generic drafting and scoring ideas through a future isolated adapter.

| Stage | `axon_b2b` requirement | Exit gate |
|---|---|---|
| 0 quarantine | Separate profile/database/config/logs; no recruiting defaults; send path absent or hard-disabled | Tests prove legacy schedules/config cannot load |
| 1 dry-run drafts | `dry_run=true` enforced in code and config; account/contact/provenance/funnel schemas; claim ledger; unresolved-placeholder, forbidden-claim, jurisdiction/entity, identity/contact, opt-out and suppression checks | Generated output is a review artifact and cannot become `sent` |
| 2 immutable approval | Exact batch manifest, content hash, named approver, expiry, per-recipient channel/time; modification invalidates approval; idempotency key reserved before provider call | Duplicate invocation produces no second provider request |
| 3 provider events | Provider message ID; accepted/delivered/deferred/bounced/complained/replied/unsubscribed events; global suppression; narrow retry only when safe; PII-redacted logs and retention | Failure-injection tests prove no follow-up after reply/bounce/opt-out and no false sent state |
| 4 limited sending | Independent Astra security review, sender/compliance readiness, manual kill switch, reconciliation dashboard | At most 10 new cold messages/day; any complaint/auth/suppression defect pauses sending |

No stage may infer replies from opens. Follow-up eligibility is computed from provider events and suppression state, not a timer alone.

## Compliance and deliverability gate

Before future sending, use one truthful business identity and review the actual recipient, country, entity type, channel, and current rules. This plan is not a legal determination.

- Google requires all senders to Gmail accounts to use SPF or DKIM, valid forward/reverse DNS, TLS, accurate message formatting/identity, and low spam rates; it recommends SPF, DKIM, and DMARC generally. Its [sender guidelines](https://support.google.com/mail/answer/81126) also reject misleading reply/thread presentation and encourage easy unsubscribe.
- For US commercial email, the FTC’s [CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) requires accurate identity/subjects, commercial disclosure where applicable, a valid postal address, a working opt-out, and prompt honoring; responsibility remains with the promoted business even when a vendor sends.
- UK rules distinguish corporate subscribers from sole traders and some partnerships, while personal-data processing can still invoke UK GDPR. Check the recipient category and objections using the ICO’s [B2B marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/).
- TRAI’s [advice to senders](https://www.trai.gov.in/advice-to-senders) describes registration, headers, templates, and consent for bulk commercial telecom communication such as SMS/voice. Do not treat an email plan as permission to automate SMS or calls in India.

Maintain global suppression, prove opt-out before scale, stop immediately on objection, avoid purchased/scraped lists and deceptive headers, and store only necessary professional data with provenance and retention.

## Campaign after the 48 hours

Keep sales and marketing connected by the same ICP, current alternative, problem evidence, and present value; do not substitute content reach for buyer conversations.

- Week 1: publish one concise technical note or 3-minute demo on exact-target selection and honest nonzero/unknown outcomes, clearly labeled non-production. End with an offer to review one recent procedure.
- Week 2: publish an anonymized “last run” reliability checklist: target, approval, attempt, deadline, evidence, recovery. No customer detail without written permission.
- Week 3: publish a comparison worksheet for SSH/cron/CI/Ansible versus the assessment criteria. Acknowledge when the incumbent is sufficient.
- Week 4: publish only verified assessment learning or a synthetic failure walkthrough. Never invent a case study, testimonial, savings figure, or buyer logo.
- Continue at most one useful post and one short demo weekly. Manually respond to relevant conversation; no auto-DMs, engagement automation, or multi-channel duplication.

After each assessment, ask permission for an anonymized lesson, referral, or named case study separately. Content CTA is a 20-minute review; sales CTA is the paid assessment.

## Metrics, decisions, and stop rules

Track counts and conversion by source: accounts researched/qualified, warm requests, cold touches, provider accepted/delivered/deferred/bounced, positive/negative replies, opt-outs/complaints, discoveries booked/completed, qualified opportunities, assessments proposed/won/paid, pilot proposals/wins, time to next action, cash collected, loss reason, assessment delivery hours, and ongoing support hours.

48-hour scorecard reports 25 researched accounts, five warm paths, number scoring 7+, no more than 10 individually reviewed cold touches, replies/bookings/proposals, and strict client count. Zero clients is a valid outcome; never alter the definition.

- After 10 qualified delivered cold touches with zero relevant replies, stop new cold sending and review evidence trigger, buyer role, subject, ask, sender trust, and deliverability before another batch.
- After 20 qualified delivered touches or warm introductions with fewer than two discovery conversations, change one ICP/trigger/route assumption; do not increase volume.
- After five qualified discoveries with zero paid assessments, revise the assessment problem, proof, deliverable, price framing, or buyer; do not build more product to avoid the sales signal.
- After three completed assessments with zero justified founding-pilot proposals, narrow/change the use case or treat the assessment as a service; do not claim product validation.
- After three pilot proposals with zero cleared payment/PO, interview losses and test scope/economics. The INR 6,000/month hypothesis remains unvalidated until retention and support burden are observed.
- Immediately pause sending on any complaint, opt-out failure, suppression/idempotency defect, authentication/alignment failure, wrong recipient, PII leak, or misleading claim. Investigate bounces/deferrals before retry; never retry permanent or ambiguous SMTP failures broadly.
- Stop pursuing an account on objection, no safe environment, no budget path, sufficient incumbent, exclusion fit, or two unanswered follow-ups. Record the reason and suppress when required.

Yash owns every outbound approval, buyer conversation, proposal, and payment decision. Astra approves product claims and any future `axon_b2b` sending/security gate. No automation, volume target, weekend deadline, or revenue need overrides recipient choice, compliance, suppression, or truthful capability boundaries.
