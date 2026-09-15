# Axon Current Product and First Revenue Plan

Implementation status: follow the [live TODO](AXON-LIVE-TODO.md) and [stabilization round 1 report](axon-stabilization-round-1-2026-09-09.md). Source findings below describe the planning baseline; a completed plan does not establish an implemented capability. Exact targeting is specified in [execution contract v2](axon-execution-contract-v2.md) and remains a subsequent implementation milestone.

Updated 9 September 2026 with the technical audit and expanded customer experience. Read this document first, then the [automation plan](<C:/My Project/Axon/docs/axon-automation-product-plan-2026-09-09.md>). Implementation detail is in the [technical audit and release plan](<C:/My Project/Axon/docs/axon-technical-audit-and-release-plan-2026-09-09.md>) and [UI/UX product specification](<C:/My Project/Axon/docs/axon-ui-ux-product-spec-2026-09-09.md>).

## The decision

Sell **the setup and support of controlled remote jobs for small infrastructure agencies that operate application servers for customers**. Start with one agency, one customer environment, three existing scripts and up to five Linux machines. Axon should let the agency run those scripts on explicitly selected machines, schedule them where appropriate, see truthful results and handle a failed or uncertain execution deliberately.

The customer buys an operational result: fewer terminal sessions and fewer interruptions to the engineer who currently runs, checks and explains these jobs. The initial commercial package includes installation, adapting existing scripts, tests, documentation and handoff. The runtime remains available through the interface and API. Automation later connects the same actions into longer procedures.

This is the best experiment for the current implementation, not a finding that a profitable niche has already been proven. No named organization below has agreed to buy Axon. Several have mature alternatives and may be better interview or delivery partners than customers.

The income goal has priority over speculative platform development. Begin conversations immediately. Begin a customer installation only after the relevant execution and access controls pass their acceptance tests. If an early buyer needs a result before Axon is ready, deliver appropriate existing tooling under a clearly scoped services agreement and record that as service revenue rather than Axon software adoption.

The companion [Axon Automation Product Plan](<C:/My Project/Axon/docs/axon-automation-product-plan-2026-09-09.md>) defines the larger product and its technical evolution. Both plans share one execution system, customer list and release process.

## Evidence and assumptions

Facts below come from inspected local source and public pages checked on 9 September 2026. A company case study is an attributed account, not an independently measured result. Judgments, prices, scores, effort estimates and success thresholds are proposals. A public services page establishes relevance, not an internal problem or budget.

The planning baseline is one founder with 25 hours available each week and a limited cash budget. Available hours and the desired income are still open variables. Divide estimated engineering hours by actual weekly engineering capacity before making a delivery promise. The first 90 days are a validation period, not a guaranteed revenue or launch deadline.

## What exists and what needs work

Axon has a React interface, a Node and Express control plane, MongoDB records, Redis and BullMQ queues, and Rust execution agents. Agents connect outward to the control plane. Shell execution, HTTP jobs, schedules, dispatch signing, permissions, execution history and notifications have implementations. A real workflow engine remains a design. The [technical assessment](<C:/My Project/Axon/docs/project-understanding-2026-09-08.md>) describes the complete architecture and the limits of previous runtime verification.

Several important paths were checked again for this plan. The worker still selects an online organization agent rather than an exact target, checks `agentResponse.error` while Rust returns an exit code, and resolves a result after catching execution failure. Result correlation still uses the job ID. The resource middleware has an admin bypass, and global administration endpoints remain accessible through an organization-admin role. These are source findings, not claims that a customer deployment was attacked. The current source therefore does not support marketing the platform as ready for unattended critical production work. [^1]

The landing page currently promises immutable audit logs, live logs, SSO/SAML, SOC 2 documentation and a 99.9% SLA. Those claims must be reconciled with implemented and tested behavior. There is no reason to promise unlimited capacity before measuring the supported operating envelope. [^2]

## The alternatives considered

Five commercially plausible entry points were compared. A means running existing operational scripts for infrastructure agencies; B means self-service operations for an internal SaaS team; C means diagnostics for software installed inside customer infrastructure; D means cron failure monitoring; E means selling an embedded execution SDK or runtime.

The scores are judgments from 1 to 5, where 5 is favorable. They expose assumptions; they are not measured market statistics. Equal weighting gives a simple comparison, while the income priority gives buyer access and engineering effort particular practical importance.

| Factor | A Agency jobs | B Internal operations | C Vendor diagnostics | D Cron monitoring | E Embedded runtime |
|---|---:|---:|---:|---:|---:|
| Severity of the problem | 4 | 4 | 4 | 3 | 3 |
| Frequency | 4 | 4 | 3 | 5 | 3 |
| Existing cost | 4 | 4 | 4 | 2 | 3 |
| Public evidence of category demand | 3 | 4 | 3 | 5 | 2 |
| Room beside existing competition | 2 | 2 | 3 | 1 | 2 |
| Ease of adopting one small piece | 4 | 3 | 2 | 5 | 2 |
| Fit with existing Axon technology | 4 | 3 | 3 | 3 | 3 |
| Limited additional engineering | 3 | 2 | 2 | 4 | 2 |
| Ease of demonstrating value | 4 | 4 | 3 | 4 | 2 |
| Ability to reach a buyer | 4 | 3 | 2 | 4 | 2 |
| Willingness to pay hypothesis | 3 | 3 | 4 | 2 | 3 |
| Expansion into automation | 5 | 5 | 4 | 2 | 4 |
| Total out of 60 | 44 | 41 | 37 | 40 | 31 |

Agency jobs win narrowly because the agency already operates the machines, can start within a small environment and may reuse the result for other customers. Its engineering lead can often evaluate the procedure and the purchasing decision together. These advantages must be checked in interviews; procurement authority and customer permission are not assumed.

Internal self-service operations are the runner-up. They offer clear value but require stronger team onboarding and permissions early. They become the first alternative segment if agency interviews show no recurring problem or no budget. Vendor diagnostics remain worth investigating when a vendor requests them, but installation inside another company's infrastructure introduces an additional approval and data-handling boundary. The earlier diagnostic-specific proposal is not the primary plan.

Cron monitoring is easy to explain but has inexpensive established solutions. Healthchecks publishes a free 20-job plan and a $20 monthly 100-job plan. A company that merely wants a missing-job alert should normally use that kind of product. [^3] An embedded runtime business could work with a committed software vendor, but no such buyer has been identified.

Full remote monitoring and management, general deployment automation, data pipelines, GPU scheduling and AI-agent platforms were also screened. Each would bring substantial expectations outside the current product. Treat them as adjacent markets, not additional launch messages.

## The exact first customer profile

Seek a small cloud, DevOps or application-maintenance agency with approximately 3 to 15 engineers. It should actively operate Linux application environments and have at least one repeated script that engineers manually start, check or rerun. A working prospect hypothesis is 10 to 75 relevant servers across customers, but a team outside that range can qualify through the actual procedure and its cost. These are targeting bands, not public facts about the named organizations.

The first installation covers only one environment whose owner authorizes the work. Start with Ubuntu Linux on x86-64 and ordinary processes or Docker workloads; pin the supported OS version after the test environment is chosen. The supported workload is a customer-owned, bounded Bash or Python script with a clear completion condition. Axon invokes it through a restricted action definition.

The economic buyer is the founder or head of delivery. The user is the engineer operating the environment. The end customer's administrator may approve installation and credentials. Establish all three roles before quoting implementation. Ask whether the agency earns a fixed support fee or bills by the hour: reducing labor improves a fixed-fee engagement directly, whereas an hourly agency may need a different reason to buy.

Qualify a prospect only when it can show a recent real procedure, its frequency, the active operator time and a specific defect in the existing approach. A directory category or an automation job posting alone is insufficient.

Disqualify a first pilot if it requires arbitrary destructive production commands, an air-gapped fleet with no reachable coordinator, Windows-only execution, mandatory 24/7 founder support, a certification Axon does not possess, or a complete replacement for an existing successful automation platform. A team needing only heartbeat monitoring is also a poor fit.

## The first offer

Working offer name: **Axon Remote Jobs Setup**. Customer-facing description: "We set up your existing server scripts so your team can run them on the right machines, see what happened and handle failures from one place."

The standard pilot includes one customer environment, three approved scripts, up to five machines, one operator initially, a named technical owner, schedule or manual execution, outcome history, failure notification, installation instructions, removal instructions and a handoff session. Add a second operator only after organization membership and role enforcement are tested. Do not disguise manual founder operation as customer self-service.

Prefer a script the customer already trusts, such as verifying an application export, generating a maintenance report, checking service configuration or validating the freshness of a test dataset. The first demonstration can use a synthetic verification script. Checking a backup's existence is not proof that it can be restored, and an exit code of zero is not proof of application correctness. Define the actual acceptance check with the customer.

Keep the original script and configuration in the customer's repository. Initially the agent invokes an approved local action ID with validated arguments. An operator cannot submit arbitrary shell text or quietly change the action. A new script version requires explicit review and installation. This delivers value before building a general script-distribution platform.

The sales promise covers the work that is implemented and tested. A future workflow engine is a separately scoped expansion. Start with an implementation agreement and manual invoicing; a billing portal does not help prove demand.

## Pricing and economics

Use the following as the opening experiment, then revise after the first three proposals.

| Item | Proposed price | Included scope |
|---|---:|---|
| Initial fit conversation | Free, up to 30 minutes | Establish procedure, authority and feasibility |
| Paid pilot | INR 30,000 | The standard bounded package, including the first 30 days of agreed support |
| Continued maintenance | INR 6,000 per month | One installation, up to five machines and three agreed actions; up to 90 minutes of maintenance plus product defect triage |
| Additional work | Separately quoted | New environments, actions, integrations or application changes |

Use milestone payments such as 50% at agreed scope and 50% at acceptance. Specify what happens if acceptance fails, when work starts, how scope changes are priced and who funds infrastructure. Do not sell months of vague future development as a finished installation. The INR 30,000 pilot sits within the earlier INR 25,000 to 75,000 exploratory range; it is now one concrete opening quote. Requote if the job cannot be delivered economically at that scope.

Offer support during defined weekday hours in India, with a next-business-day initial response as a proposed commitment only if it is sustainable. An acknowledgement is not a resolution promise. The customer's operations team remains responsible for production incident response. No 24/7 promise, uptime percentage or disaster-recovery guarantee belongs in the first contract.

Illustrative customer calculation: eight active engineering hours saved per month at an assumed internal value of INR 1,500 per hour equals INR 12,000 of released capacity. After INR 6,000 maintenance, the net modeled value is INR 6,000 monthly, making INR 30,000 setup roughly a five-month payback. This is capacity value, not necessarily payroll cash saved. With only two hours saved, the same offer is unattractive. Replace all inputs with the customer's numbers and include any new effort needed to operate Axon.

Illustrative founder calculation: at INR 6,000 monthly, 90 minutes of work valued internally at INR 1,000 per hour and INR 500 allocated operating cost leave INR 4,000 before sales time, product development, taxes and other overhead. If support takes four hours, only INR 1,500 remains. Track this rather than assuming recurring revenue is passive.

Five retained installations produce INR 30,000 gross monthly maintenance revenue, nine produce INR 54,000, and seventeen produce INR 102,000. These are arithmetic scenarios, not forecasts. Do not count setup fees as monthly recurring revenue. Record software fees, hosting and implementation/support revenue separately even when the invoice bundles them.

## Why established products do not end the experiment

| Alternative | Verified capability or price | When it should win |
|---|---|---|
| Healthchecks | Job heartbeat monitoring; free and inexpensive paid plans | Missing-run alerts are the entire problem |
| Semaphore UI | Runs and schedules Ansible and scripts; Community is free and the displayed Pro entry configuration is $490 yearly | The team already has suitable playbooks and can operate the dashboard |
| Windmill | Remote workers, scripts, flows and permissions; commercial self-hosted starting figure $120 monthly | The customer wants an established script and workflow platform |
| Rundeck and Octopus | Operational workflows and self-service runbooks | The team already uses them successfully or needs their mature capabilities |
| AWS Systems Manager | Operations across AWS and supported hybrid or multicloud nodes; feature-specific pricing | The customer's accounts, permissions and workflows already fit SSM |
| SSH, cron and CI pipelines | Existing flexible tools with little new purchasing friction | The scripts are well maintained and the team has no material operational burden |

Prices were checked on 9 September 2026. Configuration, billing period, support and feature limits differ; these figures are not equivalent quotes. [^3][^4][^5][^6][^7]

Axon's first advantage can be the delivered procedure and hands-on setup, with a narrowly understandable execution model. That is a service advantage. A software advantage must later be demonstrated through lower setup effort, clearer recovery, repeat use and customers preferring Axon after an honest comparison.

Before a pilot, walk through the same script in the customer's existing tooling and one appropriate incumbent. Record installation time, required changes, operator steps, failure visibility, ownership and annual cost including labor. Do not claim a benchmark win until the comparison has actually been performed.

## Deployment and ownership

Use a dedicated installation inside a customer-controlled account or network for the first pilot. Pin container and agent versions. Keep MongoDB and Redis off the public network, provide TLS at the edge, restrict the administrator interface and document outbound connectivity. A dedicated installation reduces the immediate hosting burden but does not excuse broken authorization.

The first supported configuration has one Node control-plane process, because socket ownership is currently process-local. Document that it is not highly available. Back up durable records and configuration, test restoration and explain what scheduled work does during downtime. Redis must not become the only record that an operation was accepted.

Do not install schedules locally on disconnected agents in version one. An unavailable coordinator or agent produces an explicit delayed, missed or uncertain state according to the documented policy. Show this limitation during sales. A true offline site requires its own reachable coordinator and a later product decision.

Keep reusable platform code separate from customer scripts and secrets. Proposed publication model: an Apache-2.0 core with paid installation, maintenance and later managed operation, subject to confirming ownership and third-party licenses before publication. The license grants real reuse rights, so it is not a protection against copying. Reliability, distribution and customer knowledge must earn the business. No root-level license was located in the scoped file inventory; package metadata is not a substitute for a coherent project license. [^8]

## Technical delivery sequence

Yash owns each work item initially. An independent engineer should review authorization and execution recovery before the first production-changing use. That review is a task to arrange, not something already completed.

### C1 Correct permissions and safe responses

Separate organization administration from platform administration. Scope resources to the organization before applying role privileges. Exclude credentials and password hashes from responses. Require authorization on logs, agents, schedules, run history and websockets as well as HTTP routes. Add a controlled invitation flow only when a second user is needed; verify session revocation and stale roles. Review cookie authentication, CSRF/origin checks, rate limiting and secret handling as part of this boundary.

Primary areas: `backend/middlewares/jwt.js`, `backend/controllers/adminC.js`, `backend/routes/adminR.js`, `backend/models/user.js`, job and provisioning routes, and `backend/server.js`.

Acceptance: organization A cannot retrieve, alter, subscribe to or execute organization B's resources, including with an admin role; viewer and operator permissions match the interface; sensitive response fields remain absent.

### C2 Correct targets and action definitions

Add explicit agent identity to the job definition and verify it at creation, launch and dispatch. Refuse to substitute another host when the target is offline. Introduce a local action catalog with IDs, approved executable paths or script checksums, validated arguments, allowed identities and time limits. Use argument arrays or a reviewed wrapper rather than interpolating operator input into shell commands.

Primary areas: `backend/models/job.js`, `backend/controllers/jobC.js`, `backend/workers/jobWorker.js`, the dispatch signer/router, and Rust connection and execution modules.

Acceptance: the requested host alone runs the action; forged target IDs, disallowed arguments and unapproved action versions fail before execution. The user sees the resolved target before starting.

### C3 Persist each run and attempt

Introduce a logical run ID and a distinct attempt ID before dispatch. Keep a stable logical operation ID across retries for actions that support deduplication. Persist target, action version, initiator and request inputs with sensitive values excluded. Correlate acknowledgement, output and result using attempt identity. Maintain a bounded durable agent journal of accepted and completed attempts so reconnects can report known results.

Acceptance: a delayed result from attempt one cannot complete attempt two. Repeated launch requests with the same request key return the existing logical run. A duplicate dispatch does not start a second process for an already journaled attempt. Journal loss or a crash between a side effect and its recording can still produce uncertainty; the system must say so.

### C4 Report failure and recovery honestly

Unify Node and Rust result schemas. Treat nonzero exit codes as failures. Separate action failure, transport failure, timeout and unknown outcome. Define retry policy per approved action: replay-safe, customer-idempotent, or manual review. Do not blindly enable BullMQ retries for actions with unknown side effects. BullMQ processor failures must be represented correctly, while persisted execution state controls whether a new attempt is permitted. [^9]

Propagate timeout to the agent, terminate the supported process group, and distinguish cancellation requested from confirmed termination. Keep resource ownership blocked while an earlier conflicting process might still be alive. Redis lock expiry alone is not evidence that the command stopped.

Acceptance: a lost acknowledgement after a command begins never causes an uncontrolled duplicate side effect; nonzero exit never appears green; expiry does not silently declare remote termination; the operator can inspect and resolve uncertain work.

### C5 Make scheduling predictable

Support manual execution first. Add cron when the customer's agreed package requires schedules, after the schedule acceptance tests pass. Either implement interval/once modes correctly or remove them from the offered interface. Apply timezone settings to the scheduler, show the next five occurrences, and test daylight-saving behavior. Make schedule edits, disabling, overlap, missed occurrences and catch-up policies explicit. Default to no overlapping runs and no automatic replay of a backlog after an outage.

Acceptance: one expected occurrence creates one logical run; editing or deleting a schedule leaves no old repeating task; a delayed run reports its original due time; schedule and launch share the same execution path.

### C6 Produce dependable execution evidence

Persist accepted, dispatched, acknowledged, completed and operator-decision events. Record terminal result, script version and target. Make failure to store required launch evidence prevent new dispatch. Bound log output and retention; label buffered output truthfully until streaming is implemented. Retry notification delivery independently from action execution and avoid placing secrets in email.

A hash chain can supplement records after its ordering and integrity model is corrected. Do not market cryptographic immutability or a compliance certification from ordinary event retention.

Acceptance: the customer can retrieve one run after restart, distinguish every attempt, see truncation and find the selected action version. Failure of email delivery does not rerun the action.

### C7 Make installation maintainable

Provide a pinned Docker Compose deployment and a least-privilege Linux service installation for the agent. Enroll with a short-lived token; provision individual revocable agent credentials; avoid sharing a tenant-spanning signing secret with every agent. Enforce local action restrictions even if a remote request asks for broader permissions. Add update and uninstall instructions, version compatibility checks and rollback of software versions with documented schema limits.

Customer-owned credentials remain local when possible. Disable unused outbound HTTP/webhook/sink paths in the first package or validate destinations, permissions, timeouts and payload limits before offering them. An arbitrary URL field is an outbound access boundary, not merely a convenience.

Acceptance: a second person can install from the instructions, run the sample action, revoke the agent, restore the control plane and remove access without help from Yash. The product shows only supported features and accurate claims.

## Verification and release gates

Fresh checks on 9 September: frontend production build passed; frontend tests had 7 passes and 2 stale-selector failures; frontend lint had 4 errors and 1 warning; Rust had 18 passing Windows unit tests. The selected backend tests had 31 passing assertions but one unhandled rejection and a failing exit status. Docker's daemon was unavailable, so no clean container integration/restore result is claimed. The [technical audit](<C:/My Project/Axon/docs/axon-technical-audit-and-release-plan-2026-09-09.md>) ranks 23 findings with impact, dependencies and acceptance checks. Re-run appropriate checks after implementation using real Redis, MongoDB and Linux agents.

| Gate | Required evidence | What it permits |
|---|---|---|
| G0 Honest demonstration | Synthetic scripts, accurate limitations, no customer access | Discovery and demonstrations |
| G1 Bounded pilot | C1 through C7 for the offered path; basic UI journey below; clean installation and real failure tests | One authorized low-impact customer pilot |
| G2 Continued use | Customer acceptance, a full relevant schedule cycle, restoration exercise and manageable support | Ongoing maintenance agreement |
| G3 Broader production use | Independent boundary review, agreed operating limits, incident procedure and workload-specific recovery | Separately scoped production-changing actions |

The failure test set must include wrong tenant, wrong target, tampered dispatch, expired credentials, exit code one, oversized output, timeout with child processes, lost acknowledgement, duplicate delivery, late result, agent restart, control-plane restart, Redis interruption, persistence interruption and schedule edit during a queued occurrence. Use a deliberate side-effect marker in a disposable environment to inspect duplication. Do not claim exactly-once external effects.

Start performance testing around the paid envelope of five agents and three actions. Publish the hardware and test conditions. Increase the envelope only when a qualified buyer requires it. Passing a synthetic test is evidence about that scenario, not a fleet-size guarantee.

The revised rough allowance is 100 to 180 focused engineering hours: the initial 80 to 140 for the shared runtime and bounded pilot path, plus 20 to 40 once for the initial UX addition. At ten engineering hours weekly that is roughly ten to eighteen weeks. Re-estimate after the first integrated slice; these are planning allowances, not scoped implementation estimates. The mature feature catalog is not included. Do not promise immediate Axon subscription income while this work remains.

## Customer-facing product and ease of use

The first package should feel complete: guided Linux installation and connection verification; a server list with a small connection map; three named action templates; simple parameter forms; an exact-server launch preview; useful run progress; honest failure/recovery explanations; searchable history and a redacted handoff record. Schedules and notification controls are included only when their tested behavior is in the pilot scope.

The [UI/UX specification](<C:/My Project/Axon/docs/axon-ui-ux-product-spec-2026-09-09.md>) defines both product stages, screen contents, empty/error/disconnected states, accessibility, graph semantics and user acceptance tasks. It also stages saved views, working search, attention inbox, customer reports, richer templates and delegation after actual usage evidence. The server map represents connections to Axon; it must not invent communication links between agents.

Prototype the journey while execution contracts are specified, then integrate it with the corrected APIs. The initial acceptance standard is that a second person can connect a supported server, run an approved action on the intended target, explain a failure and hand off its record without live help from the author. Fix misleading status and broken onboarding before expanding visual effects or landing-page claims.

## Customer acquisition

Use founder-led selling, meaning Yash personally learns the problem and makes the first sales. The recommended order is warm introductions, relevant agency or founder conversations, responses to explicit work requests, then small batches of evidence-based email. Public engineering content supports trust but is not the primary first-month source of customers.

No research supports a universal best subject line, send hour or conversion rate for Axon. Treat those as experiments. An older YC sales article supports identifying reachable prospects and direct conversations; its historical tool suggestions are not a current purchasing recommendation. [^10]

### Build a useful prospect list

Search agency services, case studies, public engineering posts, cloud-partner directories and explicit DevOps work requests. Examples of useful queries are `"managed DevOps" "Docker" "Ansible"`, `"application maintenance" "Linux" agency`, and `"staging environment" "manual" deployment`. Read the actual evidence page. Do not infer pain merely because a company uses Linux.

Record company, website, geography, evidence URL and date, the observed infrastructure clue, candidate procedure, likely buyer, contact route, current alternative, budget authority, permission owner, qualification status and next action. Keep unknowns blank or marked unknown. Distinguish a research interview, a potential buyer and a delivery partner.

Use this 10-point qualification rule: two points for a recent repeated procedure, two for measured operator burden, two for an accessible budget owner, two for dissatisfaction with the current approach, and two for willingness to test on an authorized environment. Public research will usually produce only a provisional score. A company with six points and a real next action deserves more effort than a famous logo with no conversation.

### First organizations to investigate

The following are named organizations with relevant public evidence. None is a confirmed prospect with an internal Axon need. Current headcounts and machine counts are not established; do not copy the targeting bands onto these companies.

| Order | Organization and observed evidence | First role and approach | Strongest uncertainty |
|---|---|---|---|
| 1 | CloudRaft publishes cloud consulting and a customer-cloud deployment case study [^11] | Founder or engineering lead through its contact page; ask about repeated operational work after installation | It may already solve the problem with its own platform and Kubernetes tooling |
| 2 | CloudZenia advertises ongoing cloud support and an AWS Marketplace DevOps service [^12] | Delivery lead through the published business contact; ask about script ownership and reruns across engagements | AWS SSM and its existing tools may be sufficient |
| 3 | CloudDrove describes managed support and publicly lists Ansible, Docker and automation tools [^13] | Operations lead through its contact page; ask for a narrow workflow comparison or partner conversation | It builds its own tools and may have little reason to buy another runtime |
| 4 | Otomato describes DevOps and delivery consulting [^14] | Founder or consultant through the company site; ask about operational requests outside deployment pipelines | The public page is older and ongoing managed-operation responsibility is unverified |
| 5 | DevOps Enabler publishes engineering and toolchain-integration services [^15] | Delivery manager through its company contact page; ask where customer jobs escape existing platforms | Existing vendor partnerships and enterprise scope may make Axon a poor fit |
| 6 | SquareOps sells managed services and has its own Atmosly platform [^16] | Platform lead for a benchmark or partner interview | Its own product is strong counterevidence to treating it as an easy buyer |

Public evidence and contact routes are in sources [^11] through [^16]. For CloudZenia, `hello@cloudzenia.com` is published on its AWS Marketplace service listing. For SquareOps, `consult@squareops.com` is published on its contact page. Use them transparently for a relevant business inquiry; neither is an introduction or permission to imply an existing relationship. For the others, follow the verified company contact route rather than guessing personal addresses.

Axians and Zoom are additional category-research examples already using Windmill. Ask for lessons only if a legitimate professional introduction becomes available; do not prioritize persuading them to replace their platform. Vendor-published accounts describe cross-customer orchestration at Axians and demo-environment automation at Zoom, which support the problem category rather than an Axon sales forecast. [^17][^18]

### Outreach messages

Use a real sender name and business identity. Replace bracketed evidence only with a fact read on the prospect's page. Add the sender details and opt-out required for the recipient's jurisdiction. These messages are drafts, not sent communications.

**Initial agency email**

Subject: Running customer scripts at [Company]

Hi [Name],

I saw [specific managed-service or case-study fact]. I'm building Axon to help teams run approved scripts on their existing Linux servers and see the outcome of each attempt. I'm offering a small paid setup for teams that still handle this manually.

Does anyone on your team regularly SSH in to start, check or rerun the same application script? If so, could we spend 20 minutes walking through one recent example?

Yash

**Follow-up after four business days**

Hi [Name], one example of the work I mean is checking an application export, rerunning an approved verification script and keeping the result attached to the correct customer environment. If that is already covered by your tooling, that is useful to know. Is there a delivery engineer who owns this kind of operation?

**Final follow-up after another six business days**

Hi [Name], I'll close this out after this note. If a repeated server procedure is taking time from your team, I can assess one example and propose a bounded implementation. If it is not relevant, no response is needed and I will stop following up.

**Partner message**

Hi [Name], your work on [verified infrastructure topic] looks relevant to a product I'm developing. I'm looking for one recurring operational procedure that an agency would like standardized across engagements. Would a joint implementation or a technical comparison with your existing tools be useful? I can share the current limitations and would scope one environment first.

For LinkedIn, make one brief, manual, relevant approach. Do not duplicate the email sequence through several channels at once. For a freelance posting, respond to its stated deliverables and experience requirements; do not paste a platform pitch or claim experience not demonstrated by the project.

### Email setup and sending practice

Use one genuine business domain and a reputable mailbox provider. Configure SPF, DKIM and DMARC and verify alignment. Google's personal-Gmail rules require SPF or DKIM for all senders and stronger requirements for bulk senders; setting up all three is a sensible baseline even at low volume. Authentication does not guarantee inbox placement. Do not use mailbox farms, fake reply prefixes, purchased scraped lists or artificial engagement schemes. [^19]

Send approximately five individually researched first messages per working day while learning, with at most two relevant follow-ups. This is a workload limit, not a deliverability guarantee. Stop immediately after an objection or opt-out and suppress that address from future campaigns. Measure qualified replies, meetings and paid next steps. Avoid tracking pixels; Apple's privacy features make opens a poor decision metric. [^20]

For US commercial email, CAN-SPAM also covers B2B messages: identify the sender and commercial purpose, use accurate subjects, include a valid postal address and provide an easy opt-out. Honor opt-outs promptly and within the stated statutory limit. [^21] UK rules distinguish corporate subscribers from individuals and sole traders, with data protection obligations applying where personal information is used. [^22] Do not transfer either rule blindly to India or other countries. Check the recipient category, provider rules and applicable law before scaling outreach; India's official DPDP rules and commencement material are the starting point for local review. [^23] Keep only the professional data needed for this purpose.

LinkedIn explicitly restricts third-party scraping and automated activity. Use manual professional interaction. Public contact information is not a license to collect an unrelated personal profile. [^24]

### Discovery and closing

Spend the first 15 minutes on the last real run: trigger, owner, machines, scripts, credentials, active minutes, frequency, failure, recovery and people waiting. Ask why the current solution has not been enough. Then establish who can approve payment and installation. Show the relevant demo only after the procedure is understood.

After the call, send a one-page scope with current procedure, measured baseline, proposed change, environment, accepted inputs, customer responsibilities, safety limits, acceptance checks, price, milestones and next date. A useful close is: "If these acceptance checks pass in the named environment, will you approve the INR 30,000 pilot with the first milestone paid at kickoff?" Do not ask whether they generally like the idea.

Use the same support workflow after acceptance: named owner, documented escalation, monthly review of use and maintenance hours, and a clear cancellation/export path. Ask for a reference or anonymized case study only after delivering value and obtaining permission.

## Public work that supports sales

Publish one useful technical explanation and one short demonstration each week at most. Topics for the current product are correct host selection, what a lost acknowledgement means, honest failure reporting, a script installation walkthrough and a comparison with cron plus monitoring. Every post should link to a runnable example or an offer to inspect a relevant procedure.

Keep unimplemented claims, customer environments, secrets and incident information out of public material. Complete repository ownership and secret checks before publishing code. Build-in-public metrics are qualified conversations and activated teams; stars and impressions are secondary. The automation plan contains the fuller public-release strategy.

## Shared weekly schedule and decision points

At 25 hours weekly, allocate ten hours to shared runtime work, ten to prospect research, conversations, proposals or paid delivery, three to the automation specification or a disposable proof, and two to public material. Once paid delivery begins, use the sales/delivery block for it and limit work in progress to one pilot. An urgent reliability issue takes priority over automation features.

| Period | Commercial work | Engineering work | Decision |
|---|---|---|---|
| Weeks 1 and 2 | Research 20 to 30 accounts, make five warm requests and 15 to 25 relevant first approaches, seek three workflow conversations | C1 and a C2 to C4 vertical slice using synthetic actions | Is the buyer problem specific enough to continue? |
| Weeks 3 and 4 | Work toward ten cumulative relevant conversations and two concrete scopes; request a paid next step | Continue the run contract, scheduling and installation; demonstrate failures | If no urgency or fit, narrow or change the segment before adding features |
| Weeks 5 through 8 | Execute a pilot only after G1; use established tooling for a separately agreed early services engagement if needed | Complete the offered path, test restoration and observe customer use | Does the customer accept, reuse and value the result? |
| Weeks 9 through 12 | Seek the second similar customer, evaluate renewal and unit economics | Fix repeated friction; begin the first linked workflow only when justified | Increase automation investment only with repeated demand |

These are targets for activity and review, not predicted funnel outcomes. A long engineering path can move the pilot beyond week eight. Do not conceal that risk. After the first 20 delivered relevant messages, inspect targeting and responses. After approximately 50, if there are no useful conversations, test a different problem statement or reachable segment; do not merely increase volume.

Track accounts researched, people contacted, qualified replies, workflow conversations, authorized tests, proposals, deposits, accepted pilots, active teams, retained customers, maintenance hours and cash collected. Record reasons for loss. A held meeting without a recurring problem is not qualified demand.

## Skeptical review

An infrastructure engineer can correctly say, "I can build this with existing tools." The response is a tested implementation and low ongoing burden, not a claim that automation is new. If the incumbent wins, record the loss honestly.

A founder can say, "Your fee is greater than the effort saved." That is fatal for that offer; improve the scope or choose a more costly procedure. An agency can say, "Our engineers already have a standard platform." That may make it a partner or interview source rather than a buyer.

A security reviewer can reject broad credentials, hidden data export or unreliable revocation. Those are technical prerequisites, not objections to answer with marketing. Procurement can reject an unsupported availability promise or unclear ownership. The first contract should be small, explicit and reversible.

An investor can say that paid customization does not prove a scalable product. That is correct. Three similar paid implementations, a reusable core and continued customer use are the proposed threshold for greater software investment. Profit from unrelated consulting can still meet the income goal, but it does not establish Axon product demand.

The plan should be reconsidered if interviews consistently show low frequency, monitoring-only needs, adequate incumbent tools, refusal to install agents, or no common implementation across customers. Revisit the internal SaaS-team segment before abandoning the technology. If no viable paid path emerges, finish the finite runtime demonstration and use the work for contract or employment opportunities rather than expanding indefinitely.

## The next seven days

1. Write the one-page offer and correct the capability description used in demonstrations. Keep the standard pilot scope visible.
2. Reproduce the critical execution and permission findings, then choose one vertical slice for correction. Record the current behavior before making changes.
3. Investigate the first six organizations above and add fourteen smaller, better-qualified companies or explicit work requests. Keep partners separate from buyer candidates.
4. Make five warm introduction requests and send the first five personalized business approaches after configuring the sender correctly.
5. Demonstrate a correct-target synthetic run, a nonzero exit and a disconnected agent. Explain any behavior still under development.
6. Hold the first procedure conversations and prepare a scope only where frequency, authority and value are real.
7. Review evidence and actual time spent. Schedule the next week around the strongest paid opportunity and the shared runtime blockers.

## Sources

All web sources below were checked on 9 September 2026. Publication dates are stated where clearly established; otherwise the page is treated as current documentation or an undated company claim. Prices and roles should be rechecked before a proposal or contact.

[^1]: Local implementation: [job worker](<C:/My Project/Axon/backend/workers/jobWorker.js:228>), [execution router](<C:/My Project/Axon/backend/services/jobExecutionRouter.js:106>), [authorization](<C:/My Project/Axon/backend/middlewares/jwt.js:83>), [administration routes](<C:/My Project/Axon/backend/routes/adminR.js:38>), and [Rust execution](<C:/My Project/Axon/agent/src/execution.rs>). Current source checks; source-level evidence only.
[^2]: Local [pricing component](<C:/My Project/Axon/frontend/src/components/landing/Pricing.tsx:11>) and [technical assessment](<C:/My Project/Axon/docs/project-understanding-2026-09-08.md>), reviewed 8 and 9 September 2026.
[^3]: Healthchecks, [Plans and pricing](https://healthchecks.io/pricing/). Current public pricing.
[^4]: Semaphore UI, [Pro](https://semaphoreui.com/pro) and [documentation](https://semaphoreui.com/docs). Current features and displayed annual price.
[^5]: Windmill, [Pricing](https://www.windmill.dev/pricing) and [Agent workers](https://www.windmill.dev/docs/core_concepts/agent_workers). Current configuration-dependent pricing and remote execution behavior.
[^6]: Rundeck, [Job workflows](https://docs.rundeck.com/docs/manual/jobs/job-workflows.html); Octopus, [Runbooks](https://octopus.com/docs/runbooks/). Current product documentation.
[^7]: AWS, [Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/). Current service and feature-specific pricing; no assumption that all SSM functions are free.
[^8]: Apache Software Foundation, [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html). License terms; publication remains a proposal requiring ownership and dependency review.
[^9]: BullMQ, [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs) and [Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs). Technical basis for failure and retry design; verify APIs against the installed version during implementation.
[^10]: Y Combinator, [Sales advice for technical founders](https://www.ycombinator.com/blog/sales-advice-for-technical-founders). Historical practitioner advice, not a current conversion benchmark.
[^11]: CloudRaft, [company services](https://www.cloudraft.io/), [customer-cloud deployment case study](https://www.cloudraft.io/case-studies/building-cloud-native-byoc-platform), and [contact](https://www.cloudraft.io/contact-us). Company-published relevance signals.
[^12]: CloudZenia, [company services](https://www.cloudzenia.com/) and [AWS Marketplace DevOps service](https://aws.amazon.com/marketplace/pp/prodview-6evqzteg5gnes). Published service scope and business contact.
[^13]: CloudDrove, [services and tools](https://clouddrove.com/) and [contact](https://clouddrove.com/contact). Company-published capabilities and contact route.
[^14]: Otomato, [About](https://otomato.io/about/). Undated consultancy description with older site material; verify current operations before prioritizing.
[^15]: DevOps Enabler, [engineering services](https://devopsenabler.com/DevOps-Engineering-Services) and [contact](https://www.devopsenabler.com/contact-us). Company-published scope.
[^16]: SquareOps, [company and products](https://squareops.com/) and [contact](https://squareops.com/contact-us/). Evidence of relevant services and an incumbent internal platform.
[^17]: Windmill, [Axians case study](https://www.windmill.dev/case-studies/axians-content), 2 February 2026. Vendor-published customer account.
[^18]: Windmill, [Zoom case study](https://www.windmill.dev/case-studies/zoom), 23 February 2026. Vendor-published customer account.
[^19]: Google, [Email sender guidelines](https://support.google.com/a/answer/81126?hl=en). Requirements and recommendations for delivery to personal Gmail accounts.
[^20]: Apple, [Mail Privacy Protection](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/). Basis for treating tracked opens as unreliable.
[^21]: US Federal Trade Commission, [CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business). US commercial email requirements.
[^22]: UK Information Commissioner's Office, [Business-to-business marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/). Subscriber distinctions and data-protection considerations.
[^23]: India's Ministry of Electronics and Information Technology, [Digital Personal Data Protection Rules 2025](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digit). Official rules and related notifications; this plan does not make a blanket determination about Indian cold-email legality.
[^24]: LinkedIn, [Automated activity](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en). Platform restrictions on scraping and automation.
