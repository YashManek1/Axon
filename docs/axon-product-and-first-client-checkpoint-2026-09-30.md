# Axon: product direction and first-client discussion checkpoint

Recorded 30 September 2026, Asia/Calcutta. This preserves the discussion and pending work so the next session can resume without losing the reasoning.

This is a discussion record, not implementation acceptance, buyer validation or a new execution contract. Source, recorded execution evidence and [the live tracker](AXON-LIVE-TODO.md) outrank this note. The request that created this file was documentation only: no product code, outreach sending, publication or deployment was authorized by it.

## 1. What we agreed, and what is still a hypothesis

The goal is to get the first paying client quickly, then use that income and customer evidence to focus further on Axon. The immediate aim is not to finish every possible automation feature before learning whether someone will pay.

Agreed direction:

- Explain the product through a useful customer workflow, not internal terms or a dashboard full of technical objects.
- Package supported scripts as recognizable operations with a purpose, exact target and understandable result.
- Explore controlled delegation: another authorized teammate should be able to perform an approved check without waiting for the engineer who wrote it.
- Make results useful for handoffs, and show honest failure and uncertain outcomes as well as success.
- Improve the frontend's clarity and quality around that journey; a visual redesign alone does not establish customer value.
- Research more than the original 25 organizations. Use recent, unresolved problems and investigate the actual workflow and existing alternatives in depth.
- Keep outreach review-only until qualification, contact basis and human approval are established.
- Make a product video after selecting a truthful, demonstrable workflow. The video is still pending.

Not finalized: the exact first buyer, best workflow, validated competitive advantage, willingness to pay, final pricing, full frontend design, video tool or launch channel. These need evidence and decisions, not assumptions disguised as completed work.

30 September clarification: also investigate an **India-first, done-for-you implementation/support offer**. An existing tool may leave an adoption gap if a specific small team lacks awareness, integration capacity or an affordable supported setup. That can be an opportunity without unique software features, but geography, willingness to pay, total-cost advantage and Axon suitability are unverified. "Full integration" is not asserted delivered: define one workflow and its supported boundaries. Compare configuring an existing tool as well as Axon, and distinguish service revenue from evidence of Axon product demand. Details and falsifying questions: [task-1 research](outreach/current-problem-validation-2026-09-30.md).

1 October feasibility discussion, retained at Yash's request: the problem category is plausible, but Axon has no validated paying buyer. Current alternatives and newer technology make generic script execution an insufficient differentiator. India-first setup, integration, training and bounded support remain hypotheses, not established advantages. Recommendation discussed: prioritize a short buyer-validation effort over months of speculative feature work; seek 5–10 permission-based conversations over roughly 1–2 weeks and a concrete paid-assessment commitment before expanding the product. Those numbers are a practical proposed experiment, not a success guarantee or scheduled activity. Continue investment when evidence establishes costly recurring pain, a responsible buyer, willingness to pay and a supported workflow. Existing-tool implementation may be a viable service outcome, but does not itself validate Axon product demand. At this checkpoint: 37 researched organizations, zero qualified buyers and no first-hand buyer evidence. This note authorizes no contact, sending, deployment or customer execution.

## 2. What Axon is trying to sell

Working hypothesis: Axon helps small infrastructure teams or agencies turn approved remote operations into a controlled, repeatable experience with explicit targets, approval and recorded outcomes.

The intended journey is: connect a supported server, choose an approved operation, inspect the exact target and relevant inputs, authorize the launch, and inspect truthful saved results. This is an internal positioning hypothesis, not an approved public promise that every part of the polished journey already exists.

Candidate first operations are a read-only staging application-version check, an approved service-health check, or bounded, sanitized diagnostic collection. Choose one from a real buyer's workflow. These names are packaging candidates, not proof that a complete installed action catalog and schema-backed forms are already implemented.

The possible reason to pay is less coordination and safer delegation around a repeated operation, with useful evidence when handing work to someone else. That benefit must be tested with a second operator and a measured baseline. Saved results alone do not prove saved time.

We have not established that Axon is universally better than Rundeck, Windmill, AWX, Semaphore or the customer's existing scripts. The comparison must be: what remains difficult for this particular team despite the tools available today, and can Axon remove enough work to justify another tool and agent?

Do not promise guaranteed exactly-once execution, universal rollback, autonomous production repair, automatic reconciliation, arbitrary-script dry runs, full multi-server orchestration or general production readiness. `UNKNOWN` means the outcome cannot be established; it does not mean failure, no effects or permission to rerun.

## 3. Current recorded progress

These are recorded local milestones, not checks rerun while writing this note:

- Authentication and tenant isolation foundations, viewer restrictions and credential-revocation protections have independent acceptance evidence.
- Manual exact-target, single-target/single-attempt execution is implemented. Targetless work is blocked; run/attempt identity, actor/job checks, truthful outcomes and bounded logs are recorded.
- Server-bound preview/approval and frontend recovery safeguards are independently accepted locally. That is not acceptance of the whole product journey.
- Durable dispatch outbox, restart recovery, agent journal, Redis failure fencing, release mismatch checks and local Linux Docker containment/upgrade/rollback drills have recorded evidence. Local containers are not a real multi-host customer fleet.
- Bounded correlated terminal-write confirmation is accepted locally: at most three load/CAS/readback cycles; a matching receipt is required before execution-output publication. Conflicts or uncertainty retain holds. Status-only `UNKNOWN` notifications may still occur.
- Bounded acceptance-response repair preserves the original run identity after confirmed insertion when later queue/readback/status projection fails, without adding execution retry or redispatch. Unresolved acceptance remains an error rather than invented success.
- Read-only saved-run evidence and exact lookup are accepted locally. They do not resolve target holds, reconcile actual operational effects or provide safe retry.
- A bounded authenticated browser check covered login, targetless job detail, saved-run empty state and accessibility names. A browser-found StrictMode defect was fixed. Guided readiness on shell-job detail is also accepted locally.
- Latest recorded backend baseline: 362 passed, 7 skipped. Latest recorded frontend baseline: 62 passed, lint/build clean. A bundle-size advisory remains. Counts belong to their recorded input versions; they are not new verification of today's entire dirty tree.

Relevant records: [live tracker](AXON-LIVE-TODO.md), [server-bound approval contract](axon-server-bound-approval-contract-v1.md), [read-only reconciliation contract](axon-operator-reconciliation-v1.md), [terminal-write acceptance](../.codex/evidence/security-acceptance-20260926.md), and [saved-run/browser evidence](../.codex/evidence/operator-reconciliation-20260928/).

Still open: safe retry, actual effect/target-hold reconciliation, live persistence-fault/process-crash checks, full positive approval and failure paths, actual screen-reader testing, clean-host installation, backup/restore and real multi-host Linux validation. A reported connected-agent harness is not a substitute for final acceptance of all relevant real-agent paths.

### Outreach is not completed

As of 1 October, the source-reviewed total is 37 organizations, not only the historical 25: nine were added in the accepted expansion packet and three in the accepted [India-first workflow assessment](outreach/india-first-workflow-assessment-2026-09-30.md). Three earlier fetch-failed candidates and the new insufficient HostingMaharaja fetch are excluded. Zero currently meet the 7/10 contact threshold; there is no first-hand buyer evidence, resolved contact, approved email, sent email or acquired client.

DailyDeploy, ixmops and ANTOPS remain service-fit hypotheses. Six historical role-level drafts remain unqualified and held. The offline outreach adapter is not an internet discovery engine. Pipeline v3's 61 passing checks establish the local evidence hold, not buyer qualification or sending readiness.

The user said there is no first-hand evidence yet. Research can continue, but a public complaint is not proof of budget, an identified buyer or contact permission. No fresh prospect workbook was created during this discussion.

Sources: [expansion review](outreach/discovery-expansion-2026-09-27.md), [workflow-fit review](outreach/workflow-fit-review-2026-09-27.md), [workflow-depth review](outreach/workflow-depth-2026-09-27.md), and [review-only outreach contract](outreach/axon-b2b-agent-contract-v1.md).

## 4. Pending tasks, in depth

1. **Validate today's problem.** Find recent examples of an unresolved repeated operational problem. Read the original account and follow-ups, investigate tools already tried, and explain why newer technology has not removed the remaining gap. Finish with an evidence-backed problem statement, not a collection of old complaints.

   30 September outcome: [bounded research assessment](outreach/current-problem-validation-2026-09-30.md) completed; full validation remains **IN PROGRESS**. Public accounts describe manual evidence handoffs and difficulty sharing scripts, but read-only observability or existing automation may already solve those cases. The next hypothesis is one repeated, approved Linux check that a teammate cannot perform without engineer help. Canonical source dates, present unresolved status, recurring cost, current-tool inadequacy and a first-hand buyer are not established. No company qualification or outreach was added.

2. **Choose the first buyer and one use case.** Identify who performs the work, who owns the pain, who can pay, how often it happens and its cost. Choose one narrow operation Axon can support safely. Infrastructure agencies/small operations teams are the starting hypothesis, not a finalized ideal customer profile.

   Bounded India-first research was independently accepted on 1 October: three new providers, one conditional staging-check assessment and a total-cost comparison with existing tools. NEXOYA is the first research priority, not a qualified buyer; employee counts, buyer pain, budget and permission remain unknown. [Packet](outreach/india-first-workflow-assessment-2026-09-30.md); [acceptance evidence](../.codex/evidence/india-first-workflow-20260930/acceptance.md). The first buyer and validated use case remain open.

3. **Prioritize the product experience specification.** An existing specification already exists; refine it around the selected first workflow rather than start a duplicate roadmap. Separate required pilot features from later expansion. Define observable acceptance checks and remove features that do not support the chosen task.

4. **Package named operations.** Replace generic “Run shell job” presentation with a useful purpose, owner, approved inputs, target, expected result and repeat-safety note. Validate the script and its supported environment. Versioning/input contracts need a decision before dependent frontend work.

5. **Make the frontend understandable and polished.** Show what Axon does, the next useful action and what is safe to do. Improve operation-to-result flow, environment/target clarity, onboarding, empty/error states and consistent language. Preserve truthful unknown data and existing safety gates; do not make unimplemented controls look functional.

6. **Validate delegation with a second operator.** Test whether another authorized teammate can complete the bounded operation without the original engineer explaining each step. Record confusion, help required, time and scope limitations. Test permissions as well as convenience; do not claim interruption reduction before measuring it.

7. **Add a sanitized handoff summary.** Build on saved-run evidence to show operation, target, requester, timestamps, run/attempt identifiers, outcome and unresolved questions. Copy/export must be permission-checked and redacted. Do not expose secrets, public logs or fabricated compliance claims.

8. **Demonstrate failure and uncertainty.** Show a confirmed command failure separately from an uncertain outcome. Explain what is known, what needs checking and why a blind retry is unsafe. The demonstration should show forbidden effects did not occur where that can actually be established.

9. **Finish eligible safe retry and operational reconciliation.** Read-only history is already delivered; verifying actual effects and resolving target holds are not. Define eligibility, identity, approval and idempotency semantics before implementation. Obtain Astra's architecture decision and independent final review. Never convert `UNKNOWN` to a safe retry merely to unblock the UI.

10. **Complete relevant real-world execution validation.** Exercise contained positive approval, failure and disconnection paths with a real connected agent; validate live persistence faults and process crashes, then the required real multi-host Linux behavior. Use isolated test data and an explicitly bounded non-production environment. Mocked tests and local Docker drills do not establish all these gates.

11. **Finish accessibility validation.** Walk through success, rejection, stale approval, failures and uncertainty using keyboard and an actual screen reader. Verify focus, announcements and understandable recovery. Automated labels and empty-state browser checks cover only part of the journey.

12. **Prove installation and recovery.** Run the supported clean-host installation/enrollment and matched-release checks. Test backup/restore with documented scope and verification of restored state. Include upgrade/recovery instructions an operator can follow; do not label deployment ready from a Compose model check alone.

13. **Validate pricing and packaging.** Test an assessment and bounded pilot offer against actual buyer authority and willingness to pay. Include deliverables, exclusions, customer responsibilities and success criteria. Monthly pricing requires observed recurring value and realistic support effort.

14. **Build a fresh prospect database.** Search multiple distinct organizations and relevant public discussions, then investigate their workflows and alternatives. Store evidence, dates, confidence, missing information and verified public contact routes. Keep research candidates separate from qualified buyers and approved recipients. Do not inflate company counts with duplicate posts, anonymous authors or distribution channels.

15. **Make a proper Axon video.** Show one recognizable problem, the exact approved operation, useful result/handoff and an honest failure/uncertainty example. Use synthetic or sanitized data. Label unfinished behavior; no fake feature screens presented as working product. Choose the video tool only after validating its repository and suitability.

16. **Prepare and approve personalized outreach.** Personalize from observed workflow evidence, explain a narrow possible benefit and ask a relevant discovery question. Validate buyer/budget/pain/contact basis, quality and applicable channel/compliance checks. Human approval precedes sender handoff. This note does not authorize emails, DMs or public posts.

17. **Win and deliver the first paid engagement.** Agree scope, price/payment path, safe environment, responsibilities and measurable success. A proposal, conversation or demo is not an acquired client. Record payment or a binding purchase commitment under the funnel definition; distinguish assessment revenue from proof of a retained product customer.

Not every later feature must be completed before selling a bounded assessment. An assessment is not permission to bypass safety gates for customer execution. A live pilot requires the relevant technical and operational acceptance gates for its exact scope.

## 5. Product experience features to prioritize

The [existing UI/UX specification](axon-ui-ux-product-spec-2026-09-09.md) is the detailed starting point. The following is a prioritization summary, not a claim of implementation:

- Guided supported installation, enrollment, connection readiness and safe first check.
- Server inventory with clear names, environments, release versions and truthful connection freshness; an accessible list remains available beside any map.
- A small approved action library: useful names, purpose, version, owner, inputs, expected result and repeat-safety information.
- Tested service-health, application-version and bounded diagnostic templates where appropriate to the buyer.
- Simple schema-backed run forms, validated at the relevant execution boundaries, rather than raw shell editing for delegated operators.
- Server-generated exact-target preview, timestamped preflight and approval bound to the intended snapshot. Preflight is not a guarantee that arbitrary commands have no effects.
- Clear run results, bounded logs, identity, actor, target, timing, uncertainty and useful failure explanations.
- Scoped history/search, exact saved-run lookup, sanitized handoff records and only eligibility-gated recovery.

Later or demand-dependent: schedules, reliable authorized notifications, attention inbox, working search palette, saved views, customer reports and a connection map that does not invent network topology. Multi-server procedures, dependencies, data mapping, partial-failure recovery, fleet launches and a delegated portal are expansion work, not first-sale prerequisites by default. Move an item earlier only when the agreed pilot requires it and the necessary contracts/gates are met.

## 6. Fresh-research rules and database fields

The user's objection was about technology changes: a 2025 pain point may already have been solved by newer tools. The research approach should therefore prioritize the last 90 days relative to the research date and exclude 2025 posts from the active prospect list. Historical sources can explain background, not establish current demand.

For every lead, check the original post date, follow-ups, whether the issue remains unresolved, alternatives attempted and the specific remaining task. A recent reply does not make an old complaint recent. A recent unresolved complaint remains a research signal until business fit and contact basis are established.

Suggested prospect-record fields:

- Organization/person's public professional role, source URL, original date and last verification date.
- Observed workflow and exact pain; frequency/time/risk when stated, otherwise explicitly unknown.
- Existing tool/workaround, alternatives considered and remaining gap.
- One bounded Axon operation that might fit; capability gaps and evidence that could falsify the fit.
- Buyer/owner signal, budget signal, confidence and questions still unanswered.
- Verified public contact route, provenance, contact/permission basis and suppression/opt-out status where relevant. Never guess an email address.
- State: research only, needs validation, qualified, awaiting human approval, approved handoff, contacted, engagement won or closed; sending states require a separately authorized workflow.

Search can use first-party company material and recent Reddit/X discussions when accessible. Do not circumvent access controls or collect unnecessary personal information. Availability of a public profile or DM button does not establish permission to contact. An internet-acquisition component, if requested later, needs its bounded security contract; the current offline adapter does not supply that capability.

## 7. Pricing discussed, not buyer-validated

The [first-client plan](axon-first-client-and-funnel-plan-2026-09-12.md) records these hypotheses:

- INR 10,000 upfront for a Reliability Assessment: a 60-minute procedure review, current-state evidence map, failure/risk analysis, one authorized supervised synthetic/non-production demonstration and a one-page scope recommendation.
- INR 30,000 founding pilot, with the assessment credited and INR 20,000 remaining, only after the relevant technical G1 gates.
- INR 6,000/month for bounded ongoing support/maintenance after an accepted pilot, if recurring value, workload and willingness to pay are demonstrated.

No buyer has accepted these prices in the recorded evidence. They are offer hypotheses, not a finalized price list or a guarantee that someone would realistically pay them. Discovery may justify changing scope, customer segment or price.

## 8. Resources mentioned: keep the use cases separate

- **OpenCreator:** raised as a possible video-making resource. The exact repository URL was not supplied, so identity, capabilities, license and fit remain unverified.
- **[brag](https://github.com/latent-spaces/brag):** a separate resource the user wants assessed. Its intended Axon role was not finalized in the retained discussion; inspect it before assigning a purpose or integration plan.
- **[PlacesToPostYourStartup](https://github.com/mmccaff/PlacesToPostYourStartup):** a distribution/launch-channel starting point, not a qualified buyer database, permission to contact people or proof of demand. Verify individual channels before use.

None of these is recorded here as installed, integrated, used to make a video or used to publish Axon. Posting/publishing remains a separate authorized action.

## 9. Recommended next-work order

The next substantive question to answer is: **What repeated problem remains unresolved for a specific buyer despite today's tools, and what narrow Axon operation could solve it?** The user paused that research to first preserve this task list; this file does not restart it automatically.

After authorization to continue:

1. Gather a bounded set of fresh workflow evidence and compare current alternatives; choose one credible buyer/use-case hypothesis and its falsifying questions.
2. Prioritize the existing experience specification around that workflow, then implement the useful named-operation/result journey and the relevant safety/installation gaps. Independent technical checks can proceed in parallel only with clear ownership and scope.
3. Validate the journey with a second operator and the required real-agent/accessibility checks. Make a truthful demo/video from what actually works.
4. Obtain a permitted buyer conversation, offer a bounded assessment where justified, then a scoped paid pilot after its gates. Measure outcomes before expanding the product.

There is no defensible single completion percentage for reaching the first sale: strong local engineering evidence and zero validated buyers are different dimensions. Track delivered technical gates, customer-validated problem, qualified buyer, permitted conversation, proposal/payment and successful delivery separately.

## 10. Instructions for the next session

Read [AXON-CONTEXT.md](AXON-CONTEXT.md) and [AXON-LIVE-TODO.md](AXON-LIVE-TODO.md) first, then this note and only the sources relevant to the active task. Check for newer decisions/evidence rather than treating this dated checkpoint as permanent truth.

Follow the repository agreement and operating model. Preserve unrelated changes, use one writer per file, keep evidence bounded, and use isolated MongoDB for collection-deleting backend tests. Recheck Redis availability when needed; do not rerun unchanged suites merely because a session restarted.

Use Astra before changing shared execution contracts, authentication/tenant boundaries, retry/idempotency semantics, destructive workflows, cross-runtime architecture or public promises, and for independent acceptance of stabilized security-sensitive work. A discussion hypothesis is not permission to change those contracts.

Do not manufacture qualification, contact details, savings, completion percentages or green tests. Do not send, deploy or publish from this note. Update the live tracker only for actual accepted milestones. No background research or work continues after the turn unless an explicitly configured mechanism exists.
