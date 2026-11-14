# Axon: runtime, automation, and income

The detailed 9 September plans now expand this decision: [current product and revenue](<C:/My Project/Axon/docs/axon-current-product-plan-2026-09-09.md>), [automation](<C:/My Project/Axon/docs/axon-automation-product-plan-2026-09-09.md>), [technical audit and deployment](<C:/My Project/Axon/docs/axon-technical-audit-and-release-plan-2026-09-09.md>) and [customer UI/UX](<C:/My Project/Axon/docs/axon-ui-ux-product-spec-2026-09-09.md>). Use those documents for implementation order and the updated effort allowances.

Decision update, 8 September 2026. Yash's priorities: income first; a standout engineering project second. Yash also wants to preserve the larger opportunity in automation while selling the current runtime.

**Recommendation: pursue multi-server operations automation as the stronger product hypothesis. Keep the current runtime as its foundation. Sell a bounded implementation of a useful operation while building the smallest workflow layer required by that same customer. Do not run two separate product businesses.**

This supersedes the earlier recommendation to make customer-installed software diagnostics the primary direction. That research remains useful, but it did not establish enough buyer evidence to justify a diagnostic-specific pivot. Neither direction has a confirmed Axon buyer yet.

Evidence language: FACT means inspected source or a public statement; vendor case studies remain attributed reports. INFERENCE means our conclusion from evidence. HYPOTHESIS means a customer must establish it. PROPOSAL means a decision or experiment, not an observed market statistic.

## Which has more potential?

| Path | Commercial assessment | Decision |
|---|---|---|
| Sell a general remote execution runtime | A reusable technical component, but buyers must still build their actual procedure around it. No demonstrated Axon-specific advantage or paying embedded-runtime customer in this investigation. | Keep available for a concrete paid need; do not make generic runtime promotion the main sales effort. |
| Build a general visual automation platform immediately | Broader possible use, but substantial remaining engineering and strong existing alternatives. A larger feature surface does not establish a reachable market. | Defer the broad platform. |
| Automate one recurring multi-server operation, using Axon where justified | Connects the runtime to a visible business outcome; implementation can be sold before a general platform is complete. Repeated requests could create a software product. | Primary experiment. |
| Finish Axon solely as a portfolio project | Preserves learning and a technical demonstration; does not itself generate customer revenue. | Fallback if commercial evidence fails; also a useful asset throughout. |

INFERENCE: automation has the stronger product opportunity for Axon because it can own completion of a valuable procedure, including the inputs, permissions, sequence, failure handling and evidence. This is not proof that automation has a larger total market than every possible runtime business. It is a judgment about Axon's present position.

There are three different confidence levels: a real market for operations automation is well supported; a narrow Axon advantage remains unproven; reliable near-term income from a new Axon software subscription is not established. Services offer a way to ask for payment against an explicit deliverable, not a guarantee of earnings.

## What the market actually establishes

- FACT, vendor-published case study, February 2026: Axians describes orchestrating work across 150 customer environments, replacing large scripts with smaller coordinated operations and choosing Windmill after evaluating alternatives. This closely matches the proposed category. It also demonstrates that a competitor already serves it. [Axians account](https://www.windmill.dev/case-studies/axians-content)
- FACT, vendor-published case study, February 2026: Zoom describes a central demo platform supporting more than 400 solutions engineers, replacing individually prepared environments with coordinated workflows. This supports the value of repeatable environment preparation; it does not establish that Zoom needs Axon. [Zoom account](https://www.windmill.dev/case-studies/zoom)
- FACT: Windmill documents remote agent workers that use HTTP without direct database access, plus flows with parallel execution and result passing. Outbound agents and workflow graphs are not unique Axon capabilities. [Agent workers](https://www.windmill.dev/docs/core_concepts/agent_workers), [flow architecture](https://www.windmill.dev/docs/flows/architecture)
- FACT: Octopus documents operational runbooks with permissions, prompted inputs, approvals and audit records. Rundeck documents workflows across nodes. A button for a multi-server procedure is an established product behavior. [Octopus runbooks](https://octopus.com/docs/runbooks/), [Rundeck workflows](https://docs.rundeck.com/docs/manual/jobs/job-workflows.html)
- FACT: Windmill's pricing page publishes a self-hosted commercial starting figure of $120/month, with the configured total depending on resources and users. A blanket claim that buyers only have unaffordable enterprise options is unsupported. [Pricing, checked 8 September 2026](https://www.windmill.dev/pricing)
- FACT: a current public work request seeks development/test environments and automated promotion workflows on GCP with a posted $500 budget. It is evidence of requested implementation work, not a completed transaction, a representative market rate, or demand for Axon. [Public work request](https://www.upwork.com/freelance-jobs/apply/GCP-Dev-Test-Environment-Setup_~022095869172631576959/)

No market-size or growth-rate estimate is needed to make the next decision. We have category evidence. What we lack is one accessible buyer with a repeated problem, an inadequate current solution and willingness to pay us.

## One product, two depths of use

The runtime executes a defined job. The automation layer coordinates several jobs to finish one operation. Both should share agent enrollment, permissions, target identity, execution records and customer installation.

A sensible progression is: first configure a useful operation for a customer; then connect its remaining steps; then let an authorized teammate launch the whole procedure. Quote implemented capability separately from future scope. Do not promise a workflow engine as already available or promise a delivery date before scoping it.

An API remains useful for technical users. Separate brands, sales funnels, agent implementations or infrastructure stacks are unnecessary now. An embedded-runtime business could become attractive if another software vendor explicitly wants to buy the execution component; no such buyer has been established here.

## The first workflow to test

PROPOSAL: start with a small software agency or SaaS team that repeatedly prepares a test/demo environment spread across existing Linux/Docker servers. The qualification is the actual recurring procedure, not company size alone. It should happen several times a month, require an engineer to supervise multiple steps, and lack a satisfactory existing pipeline. The CTO or engineering lead can approve a small implementation; the engineer doing the procedure is the user.

Illustrative proof, using disposable infrastructure and synthetic data:

1. Select the named test environment and approved fixture version.
2. Pause its test workers on servers A and B.
3. Load the approved synthetic fixture into the test database on C.
4. Rebuild application/cache state on A and B in parallel.
5. Run a smoke check from D.
6. Resume the test workers and publish a ready/failure report.

This is a demonstration hypothesis, not a discovered market gap. A customer's more painful existing procedure should determine the paid scope. If its GitLab pipeline or an Ansible playbook already handles this well, do not replace it merely to install Axon.

The business outcome is that an authorized teammate can prepare the environment without an engineer supervising every machine. Measure active operator minutes, unsuccessful runs, time spent recovering, and maintenance effort. Infrastructure run time may remain unchanged.

PROPOSAL: ask for a fixed implementation fee after seeing the existing procedure. A first price experiment is INR 25,000–75,000 for a tightly bounded workflow, subject to effort and acceptance criteria. This is not a market-rate finding. Scope discovery, integration, failure testing, documentation and handoff explicitly; customer infrastructure and any third-party licenses are separate. Only quote ongoing maintenance when there is concrete work and a defined response commitment. Do not imply 24/7 support from a solo founder.

If established tooling delivers the agreed result more credibly, use it. That earns service revenue and validates the problem, but does not validate demand for Axon's software.

## The automation engineering that matters

FACT: [workflow-architecture.md](<C:/My Project/Axon/docs/workflow-architecture.md:43>) labels the workflow design as not implemented. The current [Runbooks page](<C:/My Project/Axon/frontend/src/pages/dashboard/RunbooksPage.tsx:21>) is a placeholder. The [worker](<C:/My Project/Axon/backend/workers/jobWorker.js:228>) chooses an online organization agent rather than an explicitly selected host. The [dependency manager](<C:/My Project/Axon/backend/services/dagStateManager.js:12>) uses each job's latest state rather than one workflow run's step state.

The earlier [technical assessment](<C:/My Project/Axon/docs/project-understanding-2026-09-08.md>) also found tenant access, exit-status, attempt identity, retry, audit and timeout issues. The runtime contains substantial engineering; it is not yet a proven production foundation. A workflow canvas would not fix those issues.

KEEP: the Rust executor, connection mechanism, central API, queueing and execution interface where their contracts are made correct.

FIX BEFORE A CUSTOMER PILOT: target identity and authorization; truthful exit/timeout reporting; distinct run and attempt IDs; safe behavior after a lost acknowledgement; restricted/revocable agent access; execution evidence; reproducible installation. Test the actual Node/Rust path on supported Linux infrastructure, including disconnects and restarts. Customer data and access remain customer-scoped even in a dedicated deployment.

BUILD FOR ONE FLOW: versioned definitions; persisted run/step state; explicit host selection; sequential steps and only the needed branches/joins; small typed outputs; a simple launch form and status view; timeout/cancel semantics; deliberate recovery policy. Include approval if the chosen operation needs it. Cancellation must distinguish a request from confirmed remote termination.

DO NOT BUILD YET: a general drag-and-drop editor, arbitrary peer-to-peer agent messaging, an integration marketplace, AI agents, broad Windows/Linux/Kubernetes support promises, automatic rollback of arbitrary commands, or a control-plane rewrite based on hypothetical scale.

Information passing between agents does not require agents to connect to each other. Initially, agent A returns a small result to the coordinator, which persists it and passes the needed input to B. Large artifacts can later use scoped references. Independent peer-to-peer communication needs a real network/locality requirement to justify its additional identity, routing and recovery problems. Here, agent means an execution process, not necessarily an AI model.

The most convincing demonstration is a partially completed operation: kill a worker connection, show the truthful state, show what is safe to retry, and explain when the system cannot know whether a side effect occurred. Do not call an arbitrary command idempotent merely because there is a Redis lock. Safe recovery sometimes requires a customer-defined check or manual decision.

## How to work on income and automation together

PROPOSAL for the next 30 days: spend at least half the available time finding buyers, observing procedures, preparing proposals and delivering paid work. Use the remaining time on runtime correctness and one narrow automation proof. This is a work allocation, not a prediction that the engineering will finish in 30 days.

First seven days:

1. Prepare one truthful current-runtime demo and a one-page offer for automating one existing procedure. Start direct, personalized outreach to five relevant contacts; do not wait for the workflow UI.
2. Build a list of 20 qualified teams or explicit work requests. Record the public signal, role to contact, existing tool and the unknown to validate. Axians and Zoom are research examples with incumbent solutions, not assumed Axon prospects.
3. Seek ten conversations, including people able to approve spending. Ask to see the last real run and failure, not whether they like automation.
4. Map one observed procedure, baseline operator effort and identify the current tool's specific deficiency.
5. Try that procedure with the customer's existing tooling or a suitable incumbent. If Axon has no practical advantage, learn that before extending the engine.
6. Propose one paid implementation with a named environment, inputs, acceptance tests, recovery rules and handoff. Take on work within demonstrated competence.
7. Prioritize code only from that procedure and the shared reliability blockers. Review whether the buyer agreed to a paid next step.

Draft opening: “I'm working on making repeated server operations easier to run and recover. Which procedure currently touches several servers and still needs an engineer watching it? I'd like to understand the last time you ran it. If there's a fit, I can scope a fixed-price implementation using your existing scripts.” Do not claim unimplemented guarantees or send a generic platform pitch.

PROPOSED commitment gates: after approximately ten relevant conversations, seek several independent descriptions of the same costly recurring procedure and at least one paid pilot or deposit. Increase product investment after three similar paid implementations demonstrate a common reusable core and at least two customers continue using and paying for the delivered capability. These are decision rules, not statistical proof.

If people praise the demo but will not share a procedure, allocate time, authorize a test environment or discuss payment, do not treat praise as demand. If all useful deliveries use existing tools, pursue the service business if profitable and retain Axon as a project. If the work stays entirely custom, it may still satisfy the income goal, but a repeatable software business is not yet demonstrated. No replies alone do not prove the market absent; check targeting and outreach quality before drawing that conclusion.

**Tomorrow's action: approach five reachable engineering leads with a request to inspect one repeated multi-server procedure. The first milestone is a paid, bounded result; the larger automation platform must earn its next increment through that work.**
