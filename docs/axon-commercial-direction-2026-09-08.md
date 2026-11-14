# Axon: commercial direction and first-revenue plan

Research date: 8 September 2026. Prepared for Yash.

> **Later decision update:** Yash clarified that income is the first priority and asked to assess selling the runtime while developing multi-server automation. Follow the [runtime and automation decision](<C:/My Project/Axon/docs/axon-runtime-automation-decision-2026-09-08.md>) for the current recommendation. The diagnostic direction below is retained as an investigated hypothesis, not the selected roadmap.

**Decision:** Pursue customer-approved diagnostics for vendors that sell software installed in their customers' infrastructure. Start by selling the implementation and maintenance of one application-specific diagnostic workflow. Use Axon as a restricted execution and evidence component where it earns its place.

**Do not launch another general orchestration platform.** The investigation establishes a real problem and capable competing products. It does not establish an underserved software market, a customer willing to pay Axon, or a durable technical advantage. This is the strongest experiment to run, not a claim that demand has already been validated.

Evidence labels throughout:

- **FACT:** supported by inspected source, documentation, a public report, or a company's own statement. A reported experience remains a report, not an independently reproduced incident.
- **INFERENCE:** a conclusion drawn from those facts.
- **HYPOTHESIS:** something a buyer, real workflow, or paid pilot must establish.
- **PROPOSAL:** a decision for Axon, including prices and success thresholds. These are not observed market averages.

The [technical assessment](<C:/My Project/Axon/docs/project-understanding-2026-09-08.md>) contains the underlying architecture review and source findings. The [prospect pipeline](<C:/My Project/Axon/docs/axon-prospect-pipeline-2026-09-08.md>) contains qualification questions and organization-specific approaches. No outreach was sent and no application source was changed for this investigation.

## 1. AXON IN ONE SENTENCE

**Proposed product:** Axon helps software vendors get the diagnostic information they need from customer-hosted installations, with the customer's approval, so support engineers spend less time asking for logs.

**Current technology:** A central application that schedules and dispatches shell/HTTP jobs, connects to Rust agents, and records execution information.

These are different statements. The first is what we should test selling; the second describes what exists.

## 2. THE PROBLEM

Some companies sell software that their customers install on their own servers. This is often called self-hosted or on-premises software. The installation may actually be in the customer's cloud account.

When the application fails, its vendor often cannot inspect that installation directly. Support asks the customer's administrator for the application version, selected logs, container status, proxy configuration, database connectivity and other clues. An incomplete answer causes another request. A developer may eventually join a call.

The problem worth selling against is **the repeated work and waiting required to obtain useful diagnostic context**. It is narrower than fixing every customer incident.

Technology, product and business:

| Layer | In plain language | Axon implication |
|---|---|---|
| Technology | Run a bounded check somewhere else and bring back its result. | Agents, dispatch, result handling and execution records. |
| Product | The first support reply already contains the right information. | A customer-approved diagnostic packet attached to the support case. |
| Business | Expensive engineers lose fewer hours to collecting that information. | A vendor pays if recurring savings exceed setup, subscription and security overhead. |

The software vendor is our customer. The vendor's own customer is the person whose infrastructure and information we must respect.

## 3. A REAL-LIFE EXAMPLE

**FACT:** In April 2026, a Plane self-hosting support discussion progressed from an authentication failure to a request for API logs, then questions about how a separate reverse proxy was connected and a request for browser network information. The exchange is visible across April 15–17. This establishes several information-gathering steps; it does not establish two full days of engineering labor. [Plane discussion](https://forum.plane.so/t/no-authentication-methods-available/94)

**HYPOTHETICAL Axon version:** The customer runs an approved, application-specific check. Support receives the deployment version, selected service status, a proxy routing check, and narrowly selected errors in one packet. A failing browser-side request may still require a separate browser capture.

Axon has improved the starting evidence. It has not automatically fixed Plane or diagnosed every possible cause.

## 4. WHO SUFFERS FROM THIS

Our initial target is a software vendor with approximately:

- 10–200 employees;
- 10–100 paying customer-hosted installations;
- one reasonably standardized Linux/Docker Compose deployment method;
- a small support/platform team, with developers regularly pulled into infrastructure triage;
- at least roughly 20–30 staff hours a month spent gathering repeatable diagnostic context;
- a CTO or engineering leader who can sponsor a small paid experiment.

These are **qualification proposals**, not facts established about every named prospect.

The users are support engineers and the customer's administrator. The buyer is usually the vendor's CTO, head of engineering or head of support. The customer's security/infrastructure owner can veto the workflow.

Initially decline community-only projects without a budget owner, buyers happy with their current diagnostic system, Windows desktop fleets, fully disconnected government environments, and teams that need a full deployment platform.

## 5. HOW THEY HANDLE IT TODAY

Common alternatives are already useful:

1. Documentation and issue templates ask for versions, commands and logs.
2. A support engineer sends a script or joins a screen-sharing session.
3. An administrator uses SSH, Docker commands or Kubernetes commands.
4. Existing observability, a helpdesk, and an upload portal carry the evidence.
5. More mature vendors use a built-in diagnostic export, Troubleshoot, Distr or Replicated.
6. Some vendors choose managed hosting and avoid supporting a broad range of installations.

**FACT:** ToolJet documents post-database-upgrade checks across Docker, AMI, ECS and Kubernetes, including application logs, connectivity and certificate concerns. This is evidence of a concrete procedure that could be packaged; documentation alone does not prove it is expensive. [ToolJet verification guide](https://docs.tooljet.com/docs/setup/postgresql-13-16/aws/verification/)

## 6. WHY THAT SUCKS

It hurts when the same checks are repeated frequently and involve several people:

- The customer does not know which information matters.
- Support receives the wrong version, service logs or time window.
- Engineers interrupt feature work to ask routine environment questions.
- Configuration and diagnostic instructions change between releases.
- Logs can contain sensitive information that should not be shared wholesale.
- Waiting for another administrator can stretch elapsed resolution time.

This is not universally painful. A clear issue template and a short local script can be completely adequate. Several public issues were fixed promptly, and community support traffic does not prove a paid customer's support burden.

The question is: **which repeated part of the last ten paid-customer tickets could have been eliminated?**

## 7. WHAT AXON DOES DIFFERENTLY

**Today: no demonstrated unique customer-facing advantage over the strongest alternatives.**

The proposed reason to buy is an application-specific service and product package: we turn a vendor's actual support questions into maintained, approved diagnostic checks, fit them into the existing support process, and prove that they reduce work.

The initial offer should include one fixed application/version range, one deployment method, a small set of diagnostic checks, clear output and handover to the existing helpdesk. It should not require the vendor to change its installer to try the workflow.

That last point is a scope choice, **not a claim that competitors always require an installer migration**. Replicated has installer-agnostic capabilities and Troubleshoot can run standalone.

**What is technically difficult in Axon:** recovering after partial failures; identifying the right organization, installation and attempt; handling lost acknowledgments; enforcing permissions at execution time; limiting subprocesses; rotating credentials; maintaining compatible agents; and preserving trustworthy result history under concurrency.

**What is not a moat:** Rust, Redis locks, outbound connections, cron syntax or a hash chain. Competitors can reproduce those building blocks. Our possible advantage is faster delivery of a specific outcome, knowledge encoded in maintained diagnostic packs, and customer trust. None is established yet.

## 8. WHY SOMEONE WOULD PAY

They would pay for engineering time returned, a shorter path to useful evidence, and maintenance of the diagnostic workflow as their application changes.

Use the buyer's own numbers:

**Monthly value = eligible cases × staff time removed per case × employer cost per hour − new administrative work.**

Illustrations only:

| Case | Assumptions | Monthly capacity returned |
|---|---|---:|
| Low pain | 10 cases × 15 minutes × $60/hour, less 2 hours of new work at $60/hour | $30 |
| Plausible target | 40 cases × 45 minutes × $80/hour, less 3 hours of new work at $80/hour | $2,160 |
| High pain | 80 cases × 1 hour × $100/hour, less 6 hours of new work at $100/hour | $7,400 |

These hourly costs, counts and savings are assumptions. Recovered capacity is not necessarily cash saved or headcount removed. Do not add speculative avoided churn, outage revenue and salary savings together.

A $750/month offer makes little sense in the first example. In the middle example it returns about three times its subscription cost before amortizing onboarding. The pilot must also demonstrate that the recurring pain exists.

## 9. THE EVIDENCE

The most useful evidence points both toward the opportunity and toward its limits.

| Evidence | Supported conclusion | Limit |
|---|---|---|
| Plane, February 2026: support asks for version and API container logs after a self-hosted failure. [Thread](https://forum.plane.so/t/home-page-error-500/25) | Routine diagnostic context is requested publicly. | The initial exchange was quick; no paid status or labor cost established. |
| Cloudraft, July 14, 2026: consulting account of an unnamed AI software vendor with manual distribution/support coordination; evaluation led to Replicated. [Case discussion](https://www.cloudraft.io/blog/cloud-native-software-distribution) | Teams invest effort in solving this class of problem. | Consulting account; unnamed customer; an incumbent already won. |
| SmartBear's vendor-published story describes a historical release process consuming over 100 engineering hours per release. [Case study](https://www.replicated.com/customer-stories/smartbear) | Customer-hosted operations can become materially expensive. | Broader release work, not diagnostic savings; historical, selected testimony; already a Replicated customer. |
| Formbricks issue #8224, June 2026: a fresh Docker Compose install failed because of migration ordering. [Closed issue](https://github.com/formbricks/formbricks/issues/8224) | Versions and migration state can matter in triage. | A product bug, now closed. Axon would not substitute for the fix. |
| Chatwoot issue #13807, March 2026: a Docker installation displayed a message as sending after its background job had failed. [Issue](https://github.com/chatwoot/chatwoot/issues/13807) | Application UI status may omit useful backend context. | A reported application bug; not evidence that Chatwoot needs a new scheduler. |
| Budibase discussion #17685, January 2026: an upgrade problem already included structured diagnostics; the reporter identified a client-update step. [Resolved discussion](https://github.com/Budibase/budibase/discussions/17685) | Diagnostic export already exists in some prospective accounts. | Strong counterevidence to selling another generic collector. |
| GitLab's current government support role involves Linux investigation, logs and constrained customer environments. [Job description](https://job-boards.greenhouse.io/gitlab/jobs/8628780002) | Companies allocate people to this work. | Hiring does not establish an external tooling budget; this segment is too demanding for our first sale. |

A named founder described on-prem support coordination in 2023. However, ShortLoop's current listing describes dealership phone software. It is a historical interview lead, not evidence of current demand for this product. [Original account](https://www.reddit.com/r/SaaS/comments/17ar031/challenges_faced_in_providing_onprem_support/), [current company](https://www.ycombinator.com/companies/shortloop/jobs)

**Research limitations:** Public issues overrepresent community users and visible failures. Private enterprise tickets, actual support effort, spending authority and willingness to install an Axon component remain unknown. Vendor case studies are selected marketing testimony. Forum anecdotes provide language and hypotheses, not incidence rates. Searches across engineering posts, GitHub, Reddit, Hacker News, Stack Exchange, hiring and procurement material did not establish a current RFP for this narrow product. No customer interview or Axon purchase has been verified.

## 10. COMPETITORS AND WHY WE CAN STILL EXIST

A competitor is whatever the buyer would do without Axon, including improving their own script.

Prices below were checked on September 8, 2026, in each source's displayed currency and billing basis. They are not normalized quotes, implementation cost estimates or evidence of Axon's pricing power.

| Alternative | Strength and buyer fit | Price evidence | Remaining work / Axon implication |
|---|---|---|---|
| **Scripts + documentation + existing helpdesk** | Lowest friction when a few checks suffice; customer stays in control. | No additional software licence may be necessary; staff maintain it. | This is the first benchmark. If a one-off script solves the problem, do not manufacture a subscription. |
| **Troubleshoot** | Open-source collectors and analyzers, including hosts without Kubernetes. | Open-source project. [Host documentation](https://troubleshoot.sh/docs/host-collect-analyze/overview/) | Custom checks and support-process integration still need ownership. Reuse appropriate components; do not rebuild collectors to claim originality. |
| **Distr** | Direct competitor across Docker/customer installations and their operation. | Annual-billing Pro display: $24/internal user/month + $56/customer organization/month; one of each totals $80/month. Community self-hosting also offered. [Pricing](https://distr.sh/pricing/) | Its Docker bundle workflow already has explicit customer approval, selected/redacted data and custom scripts. The assumed feature gap is absent. [Bundle documentation](https://distr.sh/docs/platform/support-bundles/) |
| **Replicated** | Software distribution, supportability, preflights and enterprise delivery; strong choice for Kubernetes vendors. | Public page contains multiple plan/card sets and contact-sales offers; obtain a current scope-specific quote. Do not use a purported entry price as our argument. [Pricing](https://www.replicated.com/pricing) | Direct uploads already remove bundle-transfer steps. [Documentation](https://docs.replicated.com/vendor/support-enabling-direct-bundle-uploads) Existing satisfied customers are poor displacement targets. |
| **Rundeck / PagerDuty Runbook Automation** | Repeatable operations across infrastructure, delegated execution and enterprise controls. | Managed Runbook Automation lists $125/user/month **plus platform fee**; self-hosted commercial product quoted. [Pricing](https://www.pagerduty.com/pricing/process-automation/) | Enterprise Runner connects outbound on 443. Axon's earlier claim that this is absent is wrong. [Runner docs](https://docs.rundeck.com/docs/administration/runner/runner-installation/creating-runners.html) |
| **Ansible / AWX / Semaphore UI** | Existing playbooks, configuration management and operator interfaces. | Semaphore Community $0; displayed Pro $490/year for its shown configuration. [Pricing](https://semaphoreui.com/pricing) | Inventory, credentials and application checks still require setup. AWX does have activity streams/logs; “no auditing” is not a valid Axon pitch. |
| **Windmill** | Scripts, workflows, interfaces, remote workers and approval controls. | Open-source self-hosting plus commercial seat/compute pricing; calculator is configuration-dependent. [Pricing/features](https://www.windmill.dev/pricing) | Closest broad automation alternative. A generic Axon Automation would face it immediately. |
| **Temporal** | Durable application workflows, recovery semantics and SDKs. | Cloud plans add consumption; Essentials plan fee is greater of $100/month or 5% of consumption. [Official pricing source](https://github.com/temporalio/documentation/blob/main/docs/evaluate/temporal-cloud/pricing.mdx) | Better baseline for durable business workflows. Building customer diagnostic UX around it is separate work; Axon should not compete on durability claims. |
| **Airflow / Kubernetes jobs** | Data workflows and jobs inside an existing cluster. | Open-source software; infrastructure and staff cost extra. [Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/), [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) | Strong when the customer already owns the execution environment. They do not by themselves deliver a vendor/customer support process. This is a product-scope inference. |
| **Jenkins / GitHub Actions** | Run scripts on existing agents/runners; integrations and logs often already installed. | Jenkins core is open source; Actions costs depend on plan and execution arrangement. [Jenkins agents](https://www.jenkins.io/doc/book/using/using-agents/), [Actions runners](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners) | Frequently sufficient for internal operations. External-customer consent and evidence need configuration. Do not assume everyone dislikes their current CI setup. |
| **Octopus Deploy** | Deployment and runbooks, permissions and approvals. | Free tier includes 10 projects, tenants, machines and users; Professional from $4,170/year, with add-ons. [Pricing](https://octopus.com/free), [Runbooks](https://octopus.com/docs/runbooks/) | Strong reason not to build generic maintenance orchestration. |
| **n8n** | Cross-system workflows, connectors and visual composition. | Annual billing: Starter €20/month, Pro €50/month; self-hosted Business €667/month at displayed limits. [Pricing](https://n8n.io/pricing/) | Infrastructure access and safe application operations still need implementation. Pricing complaints do not create a technical moat for Axon. |
| **AWS Systems Manager** | Existing AWS/hybrid operations, runbooks and access control. | Usage-based Automation; hybrid pricing rules changed in 2026. Check current regional details. [Pricing](https://aws.amazon.com/systems-manager/pricing/?loc=ft), [hybrid documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/activations.html) | An adequate default for many AWS-centric teams. “Works outside EC2” is not unique to Axon. |
| **Tailscale / remote access** | Makes existing administrative access easier. | Tailscale Standard lists $8/user/month. [Pricing](https://tailscale.com/pricing) | Secure access may solve enough of the problem. It does not author or maintain diagnostic procedures for the vendor. |
| **NinjaOne / RMM products** | Broad endpoint management for IT teams and managed service providers. | Obtain a configuration/volume-specific quote. [Pricing](https://www.ninjaone.com/pricing/) | Buyers expect patching, endpoint inventory and established support. Axon is missing much of that product. |
| **Healthchecks / cron monitoring** | Detect missed scheduled jobs without replacing execution. | 20 checks free; 100 checks $20/month on monthly billing. [Pricing](https://healthchecks.io/pricing/) | If the only problem is “tell me when cron fails,” use this category. |

**Observed complaints, with limits:** A 2024 Rundeck alternatives discussion sought approachable forms for a service desk; it is a workflow/usability complaint, not proof Rundeck cannot execute jobs. An August 2026 Jenkins discussion included continued use as central Windows/Linux cron despite dissatisfaction. n8n users have questioned the jump to paid self-hosted collaboration. These are individual accounts, with positive and competing-product replies; none establishes a broad migration wave. [Rundeck discussion](https://www.reddit.com/r/devops/comments/1cjgb72/alternatives_to_rundeck/), [Jenkins discussion](https://www.reddit.com/r/devops/comments/1vgzwr7/anyone_still_using_jenkins/), [n8n discussion](https://www.reddit.com/r/n8n/comments/1tmhfld/confused_by_n8n_pricing/)

**Why we might still exist:** A buyer may prefer paying us to implement and maintain a narrowly useful workflow. This is a service-delivery and focus hypothesis. It is not a structural limitation of Distr, Replicated or Windmill. We must win a comparison on the buyer's real tickets. If an incumbent is the better answer, recommend it and consider paid implementation work instead of forcing our engine into the sale.

### Choosing among commercial directions

Scores are founder judgment, not market measurements. Each criterion is 1–5; 5 is favorable. Competition means room to win; switching means ease of adoption; engineering means less additional work. Equal weights make the reasoning inspectable, not statistically precise.

| Criterion | Support diagnostics with setup | MSP operational runbooks | Cron reliability | Backup restore verification | Data/durable workflow engine | Edge fleet operations |
|---|---:|---:|---:|---:|---:|---:|
| Pain severity | 4 | 4 | 3 | 5 | 4 | 4 |
| Frequency | 4 | 5 | 5 | 3 | 5 | 4 |
| Existing problem cost | 4 | 4 | 2 | 5 | 4 | 4 |
| Evidence of problem | 4 | 4 | 4 | 3 | 4 | 3 |
| Competitive room | 2 | 2 | 1 | 2 | 1 | 1 |
| Ease of switching | 4 | 2 | 4 | 3 | 1 | 2 |
| Advantage from existing Axon | 3 | 3 | 3 | 2 | 1 | 2 |
| Engineering remaining | 3 | 2 | 4 | 2 | 1 | 1 |
| Ease of demonstrating value | 5 | 4 | 5 | 3 | 3 | 3 |
| Ease of reaching buyers | 5 | 3 | 4 | 3 | 3 | 2 |
| Willingness to pay, unvalidated | 3 | 4 | 2 | 4 | 4 | 4 |
| Expansion possibilities | 4 | 4 | 2 | 3 | 5 | 4 |
| **Total / 60** | **45** | **41** | **39** | **38** | **36** | **34** |

**Recommendation:** Support diagnostics wins because a small, non-mutating workflow can be tried alongside the existing product, the public prospect trail is unusually accessible, and its value can be measured in support tickets. It does not win on unique technology.

**Why reject the attractive alternatives now:**

- **MSP runbooks:** real repeated work, but patching, Windows support, multi-customer administration, incumbent RMM integrations and security credibility expand scope substantially. Axon's previous “outbound plus audit” differentiation is not supported.
- **Cron:** easier engineering, weak leverage on price, abundant adequate products. A missed critical job is expensive, but many monitoring fixes are cheap.
- **Restore verification:** a worthwhile paid services category, but knowing that the restored application actually works requires backup/database expertise and safe test infrastructure. Logicata describes an EdTech implementation using AWS restore testing: evidence for demand and an adequate existing route. [Case study](https://www.logicata.com/case-studies/automated-backup-restore-testing-education/)
- **Data/ML workflows:** technical overlap is superficial where customers need mature DAG/run semantics, recovery, ecosystem integrations or GPU scheduling. Axon is behind established products on the customer's critical criteria.
- **Edge fleets:** hardware/firmware compatibility, intermittent networks, update rollback and device diagnosis expand the product. Airthings' Memfault story demonstrates the problem and an established solution, with embedded operating systems outside Axon's current focus. [Case study](https://memfault.com/customers/airthings-case-study/)

**Sensitivity:** Reducing support's adoption score from 4 to 2 and its reach score from 5 to 3 erases its four-point lead. Customer permission and access to decision makers are load-bearing assumptions. A single paying backup customer could outweigh this desk-research ranking. Do not choose by the total alone.

## 11. THE EXACT FIRST CUSTOMER

**First organization to approach: Plane at plane.so.**

The target engagement is with the owner of support for paying self-hosted customers. It is not selling to a random community user.

**FACT:** Plane announced a self-hosted Enterprise plan in January 2026. [Release](https://plane.so/changelog/release-v2-2-0-enterprise-rollout-enhanced-search-workspace-refinements)

**INFERENCE:** There is a commercial reason to care about the support experience of customer installations.

**HYPOTHESIS:** Its paid support workload contains enough repeated environment checks, its current tools leave meaningful work, and it would fund outside help. None of those three is established by a community thread.

Initial sponsor to locate: Vihar Kurama, co-founder/COO, or the person he identifies as responsible for self-hosted support; technical approval from the engineering owner. [Leadership listing](https://wellfound.com/company/planepowers/people)

Ask to review three anonymized paid-customer incidents and identify one recurring check sequence. Do not open with a claim that Plane's support is broken.

Plane is first because the public evidence is concrete and commercial self-hosting is explicit. Formbricks, Chatwoot and ToolJet are the next investigations. There is no “exact first buyer” until someone agrees to pay.

## 12. THE PRODUCT WE SHOULD SELL

**Axon today is a general remote job execution foundation. For a software vendor repeatedly gathering evidence from customer-hosted Linux/Docker installations, Axon should become a maintained, customer-approved diagnostic workflow.**

Working offer name: **Axon Support Diagnostics**.

The smallest credible engagement:

- One vendor application.
- One supported Linux/Docker Compose installation method.
- One recurrent support problem category, selected from real tickets.
- Five to eight checks, specified and reviewed with the vendor.
- Two explicitly supported application versions, rather than “all versions.”
- A customer-triggered, short-lived local collector with preview/export.
- A support-case packet showing installation, version, check results, timestamps, omitted checks and collection errors.
- Handoff to the vendor's existing ticket process.
- A 30-day measurement period and a named owner for updating the pack.

**First mode:** the customer downloads a pinned, inspectable collector, runs it locally, reviews the proposed output, and chooses whether to share it through the existing approved support channel. No always-connected agent is required to validate the first outcome.

**Connected mode:** only after need and approval are established, add a vendor-hosted control plane and enrolled agents with strict local policy. This requires Axon hardening. “Outbound” does not mean automatically approved by security, and does not cross an air gap.

This uses less of the current scheduler than a general automation product would. That is acceptable. Revenue must justify the architecture, not the other way around.

## 13. WHAT NEEDS TO CHANGE IN AXON

### What the code actually contains

| Area | Status in the inspected checkout | Business relevance |
|---|---|---|
| React/TypeScript frontend; Express/Socket.IO API | Implemented; frontend builds | Starting point for administration and result review. |
| MongoDB domain data; Redis/BullMQ queues and embedded workers | Implemented paths | Useful dispatch plumbing; not proof of durable workflow correctness. |
| Rust/Tokio outbound agent; shell execution and signed dispatch | Implemented paths | Reusable execution foundation after policy and identity hardening. |
| HTTP jobs, schedules, sinks and notifications | Implemented paths | Mostly outside the first diagnostic workflow. |
| Organization roles, retries, audit chain, sandboxing | Partial/inconsistent guarantees | Must not be sold as complete security or reliability controls. |
| Full runbooks/DAG product, SSO/SAML, billing | Planned or not found implemented | Not available to sell today. |
| Operational deployment definitions and telemetry | Present | Useful starting materials, not production certification. |

Architecture in words: browser → API/control plane → Redis queue → Node worker → agent connection → Rust process → result/history. MongoDB stores organizations, jobs and evidence; Redis also stores transient state and logs. HTTP jobs execute in the backend. Agents initiate connections, but dispatch uses that established connection in the reverse direction. The local socket registry also creates work for horizontal scaling.

**Production assessment:** There is substantial engineering and reusable code. The system as a whole is not presently established as safe production infrastructure. A build or unit test pass cannot establish that.

Prior local verification: frontend production build passed; frontend tests were 7 passed/2 failed on stale title selectors; Rust Windows offline tests were 18 passed; backend tests could not complete reliably because local Redis was unavailable. Linux isolation, real Node-to-Rust failure recovery, production deployment and load limits were not proved. See the dated technical assessment for exact scope.

### KEEP

- Existing Rust execution code as a foundation for a bounded collector.
- Result presentation, organizations and installation inventory concepts.
- Manual triggering and execution records where the paths are repaired.
- Existing deployment/observability groundwork.
- Customers' own useful scripts and existing support channels.

### CHANGE

- Replace job-centric language with customer installation, support case, diagnostic pack and collection result.
- Bind every run to a specific organization, installation, recipe version and attempt.
- Replace arbitrary shell input in the first product with reviewed, versioned checks and typed parameters.
- Turn raw output into a clear result: collected / omitted / failed / unknown, plus evidence.
- Treat customer approval as approval of an exact pack and data scope, not blanket remote access.
- Correct marketing and old strategy assumptions before using them in sales.

### BUILD

Two gates keep the scope credible.

**Gate A — before a local diagnostic pilot:**

1. A short-lived execution mode; pinned pack version and inspectable commands.
2. Locally enforced command/argument policy and narrow privileges.
3. Bounded time/output/resources; process cleanup; truthful check outcomes.
4. Collection from explicit fields/files; masking before export; customer preview and exclusion.
5. No database rows, secrets or blanket environment dumps by default.
6. A stable packet schema, version compatibility tests and secure customer-chosen transfer.
7. A documented supported environment, uninstall/cleanup path and clear support scope.
8. Review of Axon's distribution licence/ownership and dependencies; no project-level licence file was found in the inspected inventory outside dependencies.

**Gate B — before any connected customer pilot or hosted shared service:**

1. Repair organization authorization, safe API projections and per-installation access.
2. Complete agent enrollment, target selection, scoped identity, credential rotation and revocation.
3. Add run/attempt identity, result matching and lost-ACK behavior.
4. Establish nonzero-exit, timeout, cancellation, disconnect and retry semantics end to end.
5. Make local policy independent of controller-supplied commands; secure transport and key handling.
6. Record approval and results durably; fix audit ordering/completeness; retention, export and deletion.
7. Prove customer separation and failure behavior with real services, not mocked sockets.

**Source findings that make these gates necessary:**

| Finding | Customer consequence | Source |
|---|---|---|
| Organization admin paths query global jobs/users. | One customer must not see another's information. | [adminC.js](<C:/My Project/Axon/backend/controllers/adminC.js:170>) |
| Shell dispatch selects the first online agent in an organization. | A support check can target the wrong installation. | [jobWorker.js](<C:/My Project/Axon/backend/workers/jobWorker.js:228>) |
| Worker checks an error property while Rust reports an exit code. | Failed diagnostics can appear successful. | [jobWorker.js](<C:/My Project/Axon/backend/workers/jobWorker.js:275>) |
| Caught failures end in a resolved processor return. | Configured BullMQ retries do not necessarily happen. | [jobWorker.js](<C:/My Project/Axon/backend/workers/jobWorker.js:381>) |
| Locks/tokens do not establish point-of-use fencing for arbitrary effects. | Retrying commands may repeat side effects. | [distributedLock.js](<C:/My Project/Axon/backend/services/distributedLock.js>) |
| Audit creation/ordering and mutable outcome coverage have gaps. | “Immutable execution proof” overstates the evidence. | [auditService.js](<C:/My Project/Axon/backend/services/auditService.js>) |
| Sandbox defaults and timeout propagation are incomplete. | Execution boundaries differ from what an operator expects. | [sandbox.rs](<C:/My Project/Axon/agent/src/sandbox.rs>), [router](<C:/My Project/Axon/backend/services/jobExecutionRouter.js>) |

Do not merely enable retries and call execution idempotent. A diagnostic reads state; a migration, webhook or payment can change it. Lost completion information must sometimes become “unknown,” not a confident retry or success.

**Pilot acceptance checks:** wrong-tenant/wrong-installation attempts rejected; edited or expired packs rejected; failed checks reported accurately; limits enforced; secrets absent from test exports; customer exclusion honored; denied permission shown as incomplete; collector works when application UI is unavailable; no output sent before approval. Connected mode additionally requires real reconnect/replay/stale-result tests. These are customer trust tests, not broad speculative feature testing.

Docker administration can confer powerful host access. Do not present a Docker socket mount as a read-only security boundary. Prefer a customer-initiated process using already-approved local access; document exactly what privilege the selected checks require.

### IGNORE FOR NOW

Excel/CSV sinks, elaborate schedules, cross-job dependencies, a generic plugin catalog, global telemetry dashboards, crypto-audit marketing, and language rewrites.

Keep useful code dormant rather than deleting it to make a strategic point.

### DO NOT BUILD

A visual workflow canvas, autonomous remediation, AI incident agents, fleet patching, Kubernetes distribution, a secrets vault, a helpdesk, unsubstantiated compliance claims, or “exactly once shell execution.”

An actual first customer's necessary identity requirement can become a gate. A hypothetical enterprise checklist should not become the roadmap.

## 14. THE 5-MINUTE DEMO

**Demonstration title: “The first support reply contains the evidence.”**

This is a proposed demo to build after selecting a prospect's recurring check sequence. It has not been built or benchmarked in this investigation.

### The environment

Use a disposable Linux VM running a small Docker Compose application with a web service, worker and PostgreSQL. Seed one controlled failure: an application process points at a deliberately incorrect internal database hostname. Do not use a real customer's secrets or infrastructure.

Prepare two paths against the same failure:

- The existing support instructions: ask for version, container status, selected logs and a connectivity check.
- A diagnostic pack containing those exact checks and output filters.

Include a healthy installation so the packet visibly identifies which installation was examined. Match only an explicitly tested error signature; do not pretend a connectivity failure proves every aspect of root cause.

### The running order

| Time | What to demonstrate | What the buyer should understand |
|---|---|---|
| 0:00–0:40 | Show the failing page and a clearly labeled reenactment of a support exchange. | Support cannot infer environment state from “it is broken.” |
| 0:40–1:20 | Follow the existing instructions, highlighting repeated questions and the administrator's work. If using a measured historical baseline, show its source and separate work time from waiting. | This is the current workflow being improved. |
| 1:20–2:10 | Customer starts the approved collector. Show application, pack version, exact checks, timeout and data scope. | The customer can see and control what happens. |
| 2:10–2:50 | Run checks. Show the failed DNS/connectivity check, successful other checks, and an omitted permission-limited check. | “Incomplete” is visible; it is not a green success screen. |
| 2:50–3:30 | Preview the packet locally. A synthetic token has been removed and a selected item is excluded. Customer explicitly chooses export/share. | Collection and disclosure are separate decisions. |
| 3:30–4:20 | Open the same packet in the support workflow: installation ID, version, evidence, timestamps and the vendor-written next diagnostic step. | Support can investigate without another basic information request. |
| 4:20–5:00 | Explain the controlled fault; customer applies the documented correction outside Axon, reruns the pack and sees checks pass. Show the before/after packet. | Same case, better evidence. Axon does not need arbitrary remediation access to be useful. |

Do not artificially type slowly to make the baseline look worse. Do not present reenacted delays as measured savings.

Show one negative path outside the main five minutes: collector permission denied, unavailable service or failed upload. The result should remain explicit and locally exportable, not silently “completed.”

**The competitive demonstration:** perform the same collection with a short script or Troubleshoot, and evaluate Distr's supported workflow. If Axon requires materially more customer effort without saving vendor maintenance work, change the product or stop building it.

**Success target:** a new administrator completes collection and review in under five minutes after obtaining the collector, and support receives the agreed minimum evidence without another basic request. Measure first-time installation/access approval separately.

## 15. PRICING

**Proposed starting offer, not validated willingness to pay:**

- **$1,500 for a 30-day pilot:** one diagnostic pack, one deployment method, up to three test/customer installations, setup and a results review.
- **Payment:** 50% to start; 50% when the agreed staging acceptance criteria pass. Do not charge for nonexistent production capability.
- **Then $750/month:** one maintained application pack, up to ten supported customer installations, routine pack updates within a defined monthly support allowance, and result/export capability.
- Test a **$500–$1,000 monthly range** as scope and measured value differ. Do not discount to rescue a customer with no recurring pain.
- Additional applications, unusual deployment variants or large portfolios require a separately scoped price. Decide larger environment bands after the first pilots.

The vendor pays; its customers do not each receive an Axon invoice. The initial unit is a maintained application pack with an installation allowance. Do not charge per diagnostic command or support seat: those charges discourage using the workflow when it is needed.

**Deployment:** start with the local collector and the customer's existing transfer channel. If a control plane is necessary, start with one dedicated instance in the software vendor's environment. Offer managed dedicated hosting later only when operations and data handling have been proved. Do not launch shared multi-tenant SaaS with the current authorization paths.

**Trial:** free sample packet and guided lab demonstration. Customer-specific pack construction is the paid engagement. Avoid unlimited free custom work and an open-ended free pilot.

**Onboarding:** founder helps inspect three to ten anonymized tickets, selects checks, reviews privileges/data with the customer administrator, validates in staging, and agrees a baseline before production use.

**Support:** publish named business hours and a next-business-day response commitment for the pilot. It is not a 24/7 emergency incident service. Write down who handles the customer's application outage when Axon is unavailable. Maintain a local fallback.

**Enterprise considerations:** buyers may request a data-flow diagram, permission model, dependency inventory, source/release provenance, supported-version policy, export/deletion rules, contract and incident contact. Answer with actual controls. Do not claim SOC 2, SAML or an availability SLA merely because the landing page mentions them. If an early buyer requires an assurance level we cannot provide, disqualify the engagement.

**Economics:** by the third similar customer, target recurring direct costs below $250/month at a $750 price. Direct costs include support time valued realistically, hosting and pack upkeep. This leaves $500 before sales, development and overhead. This is a target, not an observed margin. If every customer needs bespoke engineering every month, we have a consultancy; price and operate it honestly.

For scale perspective only: ten customers at $750 produce $7,500 of monthly recurring revenue before costs. That is a revenue milestone, not a market-size estimate or a forecast.

## 16. HOW I GET THE FIRST 10 CUSTOMER CONVERSATIONS

**Founder-led sales** means we speak to buyers ourselves and learn why they would pay, rather than hiding the uncertainty behind advertising.

### Build the list

Start from the verified organizations in the pipeline. Expand to 30 accounts using public company sites, commercial self-hosted documentation, GitHub discussions/issues and support hiring.

Useful searches:

- “self-hosted” “enterprise” “Docker Compose” “support”
- “share the logs” / “which version” / “after upgrading” in a vendor's forum
- “customer environments” “support engineer” in public job listings
- “troubleshooting” “verification” in official installation documentation

For each account:

1. Verify the exact domain and product identity.
2. Confirm an active commercial self-hosted offering.
3. Find two recent evidence items, preferably from different incident types.
4. Record what the source actually establishes, its date and resolution status.
5. Look for existing diagnostics, Replicated/Distr usage or a managed hosting alternative.
6. Find the support/platform owner and a plausible budget sponsor.
7. Score relevance and record the biggest reason the account might not buy.

Prioritize five strong accounts over fifty vague “DevOps companies.” An issue count is not a support-cost estimate. Do not count the same incident copied between Reddit and GitHub twice.

### Contact plan

Seek ten **interviews**, not ten assumed customers:

- Six software-vendor conversations, including both a support user and buyer perspective.
- Two administrators who operate a vendor's software, to test permission and collection friction.
- Two consultants or experienced on-prem software founders, to learn implementation and buying patterns.

Three of those ten should include a budget owner. If two interviewees work at the same company, count two conversations but one account. Ask for introductions at the end.

Start with 15 personalized messages over three days, one respectful follow-up after four or five working days, and expand to 30 evidence-qualified accounts if necessary. These are activity targets, not a guaranteed response rate or ten guaranteed meetings.

Use an existing professional connection, a public professional profile, or the company's appropriate contact channel. Contribute useful technical discussion without turning someone else's bug report into a sales pitch. No mass spam, guessed personal email addresses or uninvited calendar bookings.

### First message

> Hi [Name] — I saw your self-hosted support discussion about [specific symptom]. It involved collecting [specific evidence]. I'm building Axon around making that information available with the first support reply, under the customer's control.
>
> Before building further, I'd like to understand whether this repeats for your paying customers. Could we spend 20 minutes walking through a recent anonymized case? If your existing tools already handle it well, that is useful for me to learn too.

Do not say “distributed orchestration,” “cryptographically immutable,” “AI SRE,” “we replace your platform,” or “we noticed your support is broken.”

### Discovery questions, before the demo

1. Walk me through the last paid-customer self-hosting incident.
2. What did you ask for, and what did you receive?
3. Which steps required your engineers? Which required their administrator?
4. How much active staff time did each step take? How much elapsed time was waiting?
5. How often did the same information-gathering pattern occur in the last month?
6. What have you already automated? Why is that insufficient?
7. Do you use a built-in export, Troubleshoot, Distr, Replicated, CI or scripts?
8. Could one customer run this collector and approve a limited export? Who decides?
9. Which data must never leave? Which privileges are acceptable?
10. What else would you spend $750/month on? Who can approve a pilot?
11. Can we test the workflow on a closed case with its diagnosis hidden?
12. If it works, what specifically would prevent you from paying?

Show the demo only after hearing the workflow. Ask for evidence and a concrete next commitment: redacted tickets, a staging installation, a security-owner meeting or a paid pilot.

“Interesting” is not validation. A signed scope with payment is stronger evidence than a compliment.

## 17. REAL PROSPECTS TO INVESTIGATE

See the [organization dossiers](<C:/My Project/Axon/docs/axon-prospect-pipeline-2026-09-08.md>) for facts, inferences, objections and tailored approaches.

| Priority | Organization | Why investigate | Important limit |
|---|---|---|---|
| 1 | Plane, plane.so | Commercial self-hosting plus visible diagnostic information requests. | Paid-customer frequency and current internal tooling unknown. |
| 2 | Formbricks | Self-hosted product and concrete Docker migration failure report. | Issue closed; security/privacy sensitivity and support budget unvalidated. |
| 3 | Chatwoot | Paid self-hosted support and application/worker context needed in a public issue. | A better error state in the application may remove that specific problem. |
| 4 | ToolJet | Explicit multi-environment verification procedure and commercial platform. | Existing observability and internal engineering may be sufficient. |
| 5 | Budibase | Self-hosted upgrade workflow and established support process. | Already has diagnostics; lower-priority counterexample interview. |
| 6 | Appsmith | Established self-hosting support practices and managed hosting offer. | Larger/more mature; a current gap is not established. Benchmark interview before pitching. |
| Partner | Cloudraft | Has implemented this category of solution for a client. | Already selected Replicated; ask about fit boundaries, not an assumed unhappy customer. |
| Historical interview | ShortLoop | Founder described the problem first-hand in 2023. | Current product differs; do not label a present buying opportunity. |

SmartBear, GitGuardian, Chef and other published Replicated customers are category evidence or benchmark interview candidates, not presumed neglected Axon leads.

No named organization's willingness to buy Axon has been established.

## 18. THE BIGGEST REASONS THIS COULD FAIL

| Skeptic | Strongest objection | Classification and response |
|---|---|---|
| CTO | “We can write this script ourselves.” | **Fatal for that account** if maintenance is small. Ask to compare actual cost and repeat use; do not add features to obscure the answer. |
| Support/DevOps engineer | “This adds another tool, and I still need to ask for browser logs or reproduce a bug.” | **Fixable** only for a well-defined subset of tickets. Measure information completeness and hand off exceptions honestly. |
| Security engineer | “A vendor-controlled agent on our network is unacceptable.” | **Fatal for connected mode** if categorical. Test customer-run, inspectable collection. If even limited export is forbidden, decline the initial account. |
| Infrastructure administrator | “Reading Docker needs powerful privileges.” | **Fixable for some environments**, not by claiming a read-only socket. Minimize checks, use existing approved access and terminate afterward. Decline if access cannot be approved. |
| Procurement manager | “You are too small, have no required assurance, and create another supplier review.” | **Potentially fatal for the first sale.** Sell through a smaller vendor/simpler scope, or wait for a suitable account. Do not fabricate certifications. Procurement means their process for approving suppliers and contracts. |
| Investor | “This is a service or a feature, not a standalone scalable company.” | **Unresolved, serious.** Show recurring renewals and reuse across three similar vendors before claiming a software business. |
| Competitor | “We already do approved collection and custom scripts.” | **True and fatal to our generic differentiation story.** Only demonstrably better implementation, maintenance or focus justifies the sale. |
| Buyer | “Our incidents are rare; users on GitHub are mostly free.” | **Fatal if true.** Paid-customer workload, not public popularity, must qualify the account. |
| Customer | “The result said success, but the check failed.” | **Fixable engineering blocker before any sale using that path.** Truthful results and failure states are mandatory. |
| Founder | “Supporting every deployment consumes all our time.” | **Fatal to this product model if persistent.** Restrict supported variants and track actual delivery/support hours. |
| Investor | “There is no AI feature.” | **Irrelevant** to this buying decision. A reliable result and a paying customer matter more. |

This challenge changed the recommendation from a potential standalone remote-support platform to a narrow service-backed diagnostic offer. The technology gap alone is not defensible.

## 19. WHAT WOULD PROVE US WRONG

These are proposed decision rules for this experiment, not statistically representative market tests.

### After ten relevant conversations

Continue only if:

- At least four accounts can show recurring, materially costly information-gathering work in paid support.
- At least two will provide redacted cases plus a staging test.
- At least one budget owner agrees to the scoped paid pilot.
- At least one customer administrator/security owner accepts the proposed data and access flow.

If access or funding is absent, stop adding product features. Review whether the account selection was wrong or the offer has no demand.

### During the pilot

Use the last ten eligible closed tickets as a baseline where possible, then record every eligible new ticket during the period. Do not select only easy wins.

Track:

- vendor staff minutes per case;
- customer administrator minutes;
- time from first request to useful evidence;
- number of follow-up information requests;
- percent of agreed evidence present;
- first-time setup/security work;
- maintenance and support hours;
- willingness to renew at the quoted price.

Targets: approximately 50% less active information-gathering work; useful packets without another basic request in at least 8 of 10 eligible cases; no cross-customer exposure, unapproved collection or hidden failure. Small samples establish pilot evidence, not universal performance.

If case volume is too low to observe this, do not call the pilot successful because the lab demo worked. Extend only for a specific measurement reason or disqualify recurring subscription demand.

### Hard reasons to stop or change course

- A script or incumbent achieves the same result with less total effort.
- Most investigation requires custom human reasoning that a stable diagnostic pack cannot reduce.
- Customer permission/installation effort exceeds the savings.
- Buyers accept demos but none pays after the agreed qualified outreach.
- Paid support demand is too small at reachable vendors.
- By the third similar vendor, each pack is largely bespoke and recurring maintenance consumes the price.
- Buyers only purchase one-time implementation and do not renew. That supports a consulting business, not the subscription thesis.

The honest fallback is paid implementation of existing support tooling, or choosing another evidenced problem. Do not relabel rejection as “the market needs education” indefinitely.

## 20. MY NEXT 7 DAYS — EXACT ACTIONS IN PRIORITY ORDER

The order matters: ticket evidence precedes expanding the product.

| Day | Priority actions | Required output |
|---|---|---|
| **1** | Prepare personalized approaches for Plane, Formbricks, Chatwoot, ToolJet and one experienced implementer. Yash sends them through appropriate professional channels. Start with requests to inspect recent cases. | Five sent messages, evidence links and a conversation log. |
| **2** | Conduct available discovery calls; ask for redacted paid-customer tickets and the administrator perspective. Expand to ten qualified accounts. | At least one documented current workflow, or an explicit gap in access to evidence. |
| **3** | Select the most repeated check sequence. Write the diagnostic packet and data/permission scope. Compare a shell script, Troubleshoot and Distr against it. | A clear build/use-existing/stop decision with buyer input. |
| **4** | Repair and verify only the execution paths needed for the chosen local collection workflow. Use disposable Linux infrastructure and synthetic data. | Truthful results, timeout/output limits, approved fields and negative-path evidence. |
| **5** | Build and record the five-minute demonstration. Have someone unfamiliar follow the collection instructions. | An honest before/after demonstration and measured administrator effort. |
| **6** | Show it to the strongest buyer, confirm security acceptance, baseline, scope and price. Present the $1,500 pilot proposal with acceptance criteria. | A decision, paid commitment or concrete objection. |
| **7** | Review evidence and costs. Schedule a staging pilot if it qualifies; otherwise revise targeting or stop this build. | A one-page continue/change/stop decision and next commitments. |

Calendar days are targets, not a promise that customers will reply or security reviews will finish in a week. While waiting, research additional accounts and perform local bounded verification. Do not expand scope just to stay busy.

**Following weeks, only after commitment:** validate the packet in the vendor's staging environment; obtain the end customer's approval; operate the limited pilot; review measured results; ask for paid continuation. Add a connected control plane only if repeated use actually warrants it.

## 21. AXON AUTOMATION — WHERE IT FITS LATER

A natural expansion is:

**Diagnostics → upgrade readiness checks → customer-approved maintenance steps → multi-step operations across installations.**

The same vendor could later ask to verify disk space and backup readiness before an upgrade, pause at an approval step, run a documented maintenance operation and collect proof afterward. That is an adjacent expansion because the buyer, installation relationship and trust boundary remain similar.

A general “n8n for distributed infrastructure” is a much larger product. It requires durable run-scoped state, step versioning, cancellation, approval semantics, safe recovery, integrations, secrets controls and long-term operational ownership. Axon's current dependency checks and runbook placeholder do not provide that product.

**Decision:** Axon Automation is a possible expansion under the same business only if paying customers repeatedly request adjacent operations. As a general-purpose horizontal platform today, it is too broad.

Proposed expansion gate: three renewing vendors, at least two asking for the same adjacent workflow, safe core execution proved, and willingness to pay more for it. Until then, expose a narrow API or export to existing workflow tools instead of building another canvas.

**IF I WERE YASH, TOMORROW MORNING I WOULD...**

Send the Plane support owner a specific request to walk through three anonymized paid-customer self-hosting tickets. My first question would be: **“How much of these cases was investigating the bug, and how much was just getting the information you needed?”**

I would start with that evidence, then offer to turn one repeated check sequence into a paid, customer-approved diagnostic pilot.


