# Axon Automation Product and Delivery Plan

Implementation status: this remains a product and engineering plan. Shared access-control/frontend stabilization is tracked in the [live TODO](AXON-LIVE-TODO.md). The [execution contract v2](axon-execution-contract-v2.md) defines the next runtime milestone. Neither a workflow graph nor the durable automation coordinator has been implemented by this planning work.

Updated 9 September 2026. The companion [UI/UX specification](<C:/My Project/Axon/docs/axon-ui-ux-product-spec-2026-09-09.md>) defines the full customer-facing experience; the [technical audit and release plan](<C:/My Project/Axon/docs/axon-technical-audit-and-release-plan-2026-09-09.md>) defines the shared safety and deployment prerequisites.

## The product decision

Build Axon Automation as **a system for running controlled application operations across existing servers and customer environments**. An engineer defines a procedure using approved scripts and APIs. An authorized teammate chooses the environment, reviews the affected machines, starts the operation and can understand what completed, what failed and what requires a decision.

The initial operation is preparing or resetting a non-production application environment that spans several machines. The initial buyer remains the agency or software team already maintaining that environment. The first customer must confirm that this work is frequent and poorly served by its current tools. Synthetic environment preparation is a useful demonstration; it is not proof of an underserved market.

The larger product can support maintenance, controlled application updates, verification and customer-environment operations. It should become especially good at partial failure, explicit machine selection and safe delegation. These are product goals to prove, not claims that competitors lack those features.

Build the runtime and automation as one product with increasing capabilities. A scheduled single action is a useful first purchase. A procedure composed of those actions is the next purchase. Keep the same agent, installation, customer identity, action definitions, run records and support relationship.

The [Current Product and First Revenue Plan](<C:/My Project/Axon/docs/axon-current-product-plan-2026-09-09.md>) is the commercial entry plan and contains the shared execution prerequisites, prospect list, outreach rules and weekly allocation. This document defines the automation product end to end. It supersedes treating the earlier workflow design as a committed second standalone product.

## What the evidence supports

Axians' February 2026 case study describes coordinating work across customer environments and moving from large scripts to smaller orchestrated operations. Zoom's February 2026 account describes a platform for consistently preparing demo environments. Both selected Windmill. They support demand for the outcome and demonstrate a capable incumbent. They do not establish an Axon buying opportunity at either organization. [^1][^2]

Windmill documents remote agent workers and flow data exchange, Rundeck documents operational workflows, and Octopus documents runbooks with permissions and approvals. A workflow graph, an agent, a self-hosted server or a launch button is not sufficient differentiation. [^3][^4][^5]

The opportunity is a hypothesis about an underserved operation and customer experience: existing scripts are available, but preparing the procedure, selecting machines, delegating execution and recovering partial work remain awkward for a reachable team. Prove this on an actual operation against the customer's current tool. If Windmill, Ansible, CI or another incumbent solves it adequately, move to a better problem rather than manufacturing a missing capability.

## The customer and the first operation

The first customer should already own the application scripts and control the target environment. It should run the procedure at least several times monthly, have a named engineer supervising it and be willing to measure active work. A small agency can initially apply it to one customer environment; an internal SaaS team is the second candidate segment.

The buyer is the agency founder, head of delivery or engineering manager. The author is the engineer who understands the application. The operator is a teammate who should be able to run the approved procedure without general server access. The environment owner authorizes agents and credentials. One person may hold several roles in a small pilot, but the permission model must keep the responsibilities distinct.

Use this illustrative procedure for the first synthetic demonstration:

1. Select the test environment and an approved fixture version.
2. Verify environment identity, required tools and available disk space.
3. Obtain approval when the selected procedure changes shared state.
4. Pause the named test workers on machines A and B.
5. Load a synthetic fixture on the test database machine C.
6. Rebuild application and cache state on A and B in parallel.
7. Run application smoke checks from D.
8. Resume the test workers if the procedure's recovery rules allow it.
9. Publish readiness or a clear record of the failed and unresolved work.

No production data or production database restore is needed for this demonstration. The customer procedure may differ. In particular, cleanup is not always equivalent to resuming service: some failed states should remain paused until an operator checks them.

The primary value metric is active operator minutes per successful operation, including recovery and maintenance effort. Also record time spent waiting for an expert, unsuccessful or uncertain runs, and whether a second person can operate the procedure. Do not claim the application itself runs faster merely because manual supervision decreases.

## The intended complete product

The complete product should have an operation library, a reliable distributed execution system, clear environment boundaries, a useful recovery interface and a maintainable deployment. The objective is that an engineer can safely hand an operation to another person while retaining control over its definition and permissions.

### A useful operation library

Each operation has a name, owner, purpose, input schema, supported environments, action versions, required permissions, expected result and recovery instructions. It can begin as reviewed configuration in Git. The UI presents a launch form and a readable graph generated from that definition.

Templates should preserve existing scripts rather than force a rewrite. Initial examples are test-environment reset, application verification and a bounded maintenance check. After paid evidence, add a controlled application update template with prechecks, a canary and batches. A canary means trying the change on one small target set before expanding.

Each template needs executable tests, an example environment, declared assumptions and a maintainer. A gallery of untested examples would increase customer risk and support cost. Publish fewer templates that work.

### Deliberate control over targets

Use the hierarchy organization, customer environment and agent. A workflow run targets one environment initially. Resolve host names or labels into a fixed list before approval. Show machines, action versions and material inputs in a launch preview. This prevents a changing label from silently adding machines during the run.

Later fleet operations can use batches, concurrency limits, maintenance windows and stop thresholds. They should expose the affected scope in ordinary language: "This operation will touch these three test servers." Cross-customer fleet execution should require explicit authorization and independent child runs; it is not enabled by a broad administrator checkbox.

### Recovery as a product capability

The recovery view should show completed work, confirmed failures, pending work and unknown outcomes separately. It should explain why downstream work is paused and what evidence would permit a retry or continuation. The author defines which actions are safe to repeat and which require a check or approval.

An operator can inspect evidence, request a safe retry, run an approved verification action or record a manual resolution with a reason. All decisions remain attached to the original run. A fresh attempt does not overwrite the first attempt's evidence.

Do not promise automatic rollback of arbitrary scripts. A compensation action is a separately authored operation intended to reduce or reverse an earlier effect. It may fail and is not a database transaction. Only offer compensation for templates with tested preconditions and recovery behavior.

### Controlled delegation

Separate author, operator, approver and viewer capabilities. Operators launch published versions with permitted inputs; they cannot edit the command. Approval is bound to the workflow version, target snapshot and material input hash. Changing any of those invalidates the approval. Support expiry and rechecking a user's authority when an approved run actually resumes.

Use ordinary authenticated approval first. Chat or email can notify an approver, but an unscoped message link must not become permanent authorization to modify infrastructure. Add enterprise SSO only when a qualified buyer requires it; use an established identity protocol rather than inventing authentication.

### Maintainable execution and evidence

The product needs a documented installation, signed or verifiable release artifacts, per-agent credentials, bounded logs, durable execution state, tested upgrades and exportable definitions. Basic security, permissions, backups and truthful outcomes belong in the usable core. They should not be postponed behind premium features.

The customer's application scripts and secrets remain under its control. Logs can reveal sensitive data even when code is open source, so provide redaction and collection limits. A useful execution report records what ran without exporting complete credentials or arbitrary filesystem contents.

## The smallest version worth selling

The first paid automation version supports one organization, one selected environment per run, a small fixed fleet and one approved procedure. It uses explicit steps, persisted progress, sequential execution, one necessary parallel branch with an all-required join, small typed outputs, a launch form, a run view and a recovery decision. Include a human approval step when required by the actual operation.

Proposed initial limits are ten agents per installation, 25 workflow steps, ten targets in a fan-out, two active workflow runs and 64 KiB of structured output per step. Start with a lower supported customer envelope if testing requires it. These are scope limits to test, not performance measurements. Store larger artifacts externally only after implementing scoped access and lifecycle rules.

Manual launch comes first, followed by the existing schedule system through the same launch API. Inbound webhooks need request authentication, replay protection and input validation before release. Do not provide arbitrary event-driven loops or a universal integration catalog initially.

The full visual authoring canvas comes after real authors repeatedly edit workflows and a form/configuration approach becomes a measured obstacle. A readable graph and a good recovery screen are needed sooner than drag-and-drop editing.

## Architecture decision

Keep React, Node, Rust, MongoDB and BullMQ for the first implementation. Introduce a small, explicitly defined workflow state machine in the backend and reuse the corrected execution service. MongoDB holds the authoritative workflow and execution state. BullMQ schedules work and wakes processors. Websockets deliver commands and UI updates; a socket event alone is not durable acceptance.

This choice reduces immediate migration work but creates responsibility for state transitions and recovery. Limit the workflow language accordingly. Do not build a general durable programming runtime, arbitrary JavaScript replay or an unbounded graph language.

Temporal is the strongest alternative to revisit for complex durable orchestration. It already separates workflows from activities and documents the need for activities to tolerate retries. [^6] Adopting it would still leave Axon's agents, local policies, target inventory, UI and customer templates to build, while adding deployment or service dependencies. For the first bounded procedure, retain the current stack. If the engine cannot pass the failure suite within its agreed engineering allowance, compare a Temporal-backed implementation before adding more custom state-machine features.

Do not rewrite the control plane in Go or Rust because of a hypothetical fleet size. Measure dispatch latency, queue age, process resources and connection ownership first. A language change does not repair an incorrect execution contract.

### Modules and responsibilities

| Module | Responsibility | Durable authority |
|---|---|---|
| Operation catalog | Definitions, versions, input schema and publishing | MongoDB and exported reviewed definitions |
| Launch service | Authorization, target snapshot, inputs and request deduplication | Workflow run and launch record |
| Workflow coordinator | Evaluate ready steps and persist legal transitions | Workflow and step records |
| Execution service | Create attempts and dispatch approved actions | Shared execution records from the current product |
| Rust executor | Enforce local policy, run action and report known outcome | Bounded local attempt journal plus central records |
| Recovery service | Reconcile gaps and accept controlled operator decisions | Recorded decisions and attempt evidence |
| UI and notifications | Explain status and request user action | Read model; never the only copy of state |

### Proposed data model

Create `Workflow`, `WorkflowVersion`, `WorkflowRun`, `StepRun`, `ExecutionAttempt`, `Approval`, `ExecutionEvent` and `OutboxEvent` records, reusing existing organization and agent models. Names are design proposals. Do not pretend these collections already exist.

`WorkflowVersion` is immutable once published and contains the action versions, dependencies, input/output schemas and recovery policy. A run pins a version and an environment plus resolved targets. Each fan-out target receives a separate step execution identity. Each retry has a new attempt ID under the same logical operation.

Use uniqueness constraints for launch request keys and step-target identities within a run. State updates check the previous state and revision rather than blindly overwriting records. Persist decision facts and their corresponding outbox records in the same transaction. An outbox is a durable list of messages that still need to be delivered; delivery can be retried without forgetting the original decision.

MongoDB multi-document transactions require a replica set or sharded deployment, not a standalone server. [^7] Configure and test this dependency explicitly. A single-member replica set can support a development transaction test but is not highly available. For a customer installation, choose the tested durability configuration and document its availability and restore limits. Do not silently assume the current Compose file supplies the required topology.

### Proposed run states

Use a small state set such as `PENDING`, `RUNNING`, `WAITING_APPROVAL`, `NEEDS_REVIEW`, `SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED` and `CANCELLED`. A step can additionally be `BLOCKED`, `SKIPPED` or `UNKNOWN`. The exact state names can change during implementation; their meaning must remain consistent across API, worker and UI.

Workflow success requires every required branch to finish successfully and every required verification to pass. A blocked or unknown step cannot be converted into success to clean up the dashboard. Cancellation is confirmed only after required remote work has stopped or its unresolved status is surfaced explicitly. Joining branches means evaluating the required results from the same run, never looking up a job's last global status.

### Proposed action contract

Each dispatch carries organization, environment, agent, workflow run, step, logical operation and attempt identities; action ID and pinned version; validated nonsecret inputs; deadline; policy revision; and integrity/replay protection. Secret values should be resolved locally from approved references wherever possible.

The agent verifies its stable identity, authorization, action policy, deadline and replay state before recording acceptance. It durably journals an accepted attempt before acknowledging it, then runs the approved action and stores its known result for reconnect delivery. A crash between process effects and durable result recording can still create uncertainty. This protocol does not make arbitrary shell effects exactly once.

Begin with per-agent or tightly scoped credentials and a key-rotation design. Do not distribute a single cross-customer signing secret to every agent. A later asymmetric signing scheme can let agents verify dispatch without possessing a key that signs new commands, but local execution policy remains necessary if the control plane is compromised.

### Information flow and graph behavior

Agents initially communicate through the coordinator: A reports a small validated result, the coordinator persists it and sends the necessary fields to B. Large data transfer, distributed shared memory and unrestricted peer-to-peer messaging are outside the initial contract.

A directed acyclic graph, or DAG, is a set of steps with dependencies and no loops. Start with sequential dependencies, bounded parallel targets and all-required joins. Conditions use a small deterministic expression format, not arbitrary code evaluation. Validate missing references and cycles before publication. Typed inputs and outputs should fail clearly when their shape is wrong.

Later add bounded iteration over a known input list, reusable sub-workflows and explicit join policies only when a paid procedure requires them. Version every nested dependency. Do not let an edited sub-workflow silently alter an active run.

### Recovery and concurrency

Run a periodic reconciler that finds pending outbox work, stale leases, missing acknowledgements and unresolved attempts. Event-driven progress handles the normal case; reconciliation handles lost or delayed messages. Its interval and scan limits are configuration to test, not an excuse for a hot full-database loop.

Retry only when the action policy permits it. A stable idempotency key belongs to the logical operation, while every attempt has a unique identity. A lost acknowledgement after a side effect requires verification or manual review unless the action itself can safely deduplicate. BullMQ's retry and idempotency documentation supports this distinction. [^8]

Use renewable ownership leases and compare-and-set transitions for coordinator work. Apply resource locks to the actual affected resource, not just the job ID: two different workflows can target the same database or environment. Fencing works only when the component performing the effect rejects stale ownership; a fencing number in a log cannot fence an arbitrary external script.

Limit concurrency per agent, environment and action class. Check the execution window again when dispatch occurs. If a lease expires while a command may still be running, do not launch a conflicting operation merely because Redis permits a new lock.

### Security and deployment

Use the corrected tenant boundary from the current-product plan. Authorize every workflow, run, log subscription, artifact and approval against its environment. Treat workflow definitions and HTTP destinations as privileged configuration. Validate URLs and egress, parameter types, file paths and output size. Keep Docker socket access and broad root privileges outside the default agent policy.

Provide a restricted service identity, a local action catalog and explicit capability grants. If a customer needs a privileged maintenance action, isolate and review that particular wrapper. Sandboxing is defense in depth, not evidence that an arbitrary command is harmless.

Initially use one dedicated control-plane deployment and customer-owned agent machines. Snapshot or back up durable records and configuration, pin versions and test restore. An offline agent does not autonomously progress the central workflow. A control-plane outage can leave in-progress work uncertain until reconciliation; show this honestly. Managed multitenant hosting, geographically distributed coordinators and offline site execution are later products requiring their own threat model and operating evidence.

## Product experience from installation to renewal

The full screen and feature specification is in the [UI/UX plan](<C:/My Project/Axon/docs/axon-ui-ux-product-spec-2026-09-09.md>). Beyond a graph, the product includes a procedure catalog, template/form authoring, typed input/output mapping, target and impact preview, version identity, step timeline, postcondition checks, contextual recovery and a useful completion record. Later paid needs can justify readable version comparisons, sub-procedure trees, approvals inbox, delegated operator portal, fleet batches and customer reports.

Use a guided form and ordered steps as the first authoring experience, with an accessible graph preview. The workflow graph represents dependencies and per-step targets; the server map represents actual control-plane connectivity. Both have a list alternative. A mature drag/drop editor is a later investment, not a prerequisite for selling one complete procedure.

Installation begins with one supported deployment recipe, a working health check and a visible version. Agent enrollment uses an expiring token and ends with a safe verification action. The environment screen shows stable host identity, capabilities, policy and connection health. It must not imply that an online agent is authorized for every action.

An author imports or creates an action definition, selects the environment and supplies an input schema. Axon validates the graph and shows any missing capability. The author runs the procedure against a disposable fixture, examines the failure cases and publishes a version. Editing a published version creates another version.

An operator opens the catalog, sees only permitted operations, fills in inputs and reviews a launch preview. Where approval is required, the approver sees the same targets and material inputs. The run screen emphasizes overall result, current blocking step, affected machine and elapsed time. Detailed logs and protocol diagnostics remain available without dominating the ordinary operator experience.

After failure, the operator sees the reason and permitted next actions. A retry produces a new attempt under the original run. A change to the procedure starts a new versioned run and links back to the original; it must not rewrite the past. Export the record for handoff or review.

The customer receives a brief operational guide, a tested recovery example and ownership of its definitions and scripts. At renewal, review which procedures were used, how much operator effort changed, which failures required help and whether maintenance stayed within the quoted scope. Ask for a reference only after acceptance and explicit permission to publish it.

## Feature sequence

| Stage | Capabilities | Customer reason | Evidence required to advance |
|---|---|---|---|
| Shared foundation | Correct target, permissions, attempt identity, failure semantics, installation and records | Trust the execution of one action | Current-product G1 for the offered path |
| First procedure | Persisted sequence, typed inputs/outputs, necessary parallelism, launch form and run view | Stop manually coordinating one operation | One real procedure and an owner willing to test |
| Controlled delegation | Published versions, target preview, approval, recovery actions and operator roles | Let a second person run it safely | Pilot requires those controls and they pass tests |
| Repeatable product | Tested templates, import/export, Git workflow, upgrades and useful reports | Reuse the result without repeated founder intervention | Similar needs in at least three paid implementations |
| Fleet operations | Canary, batches, health gates, maintenance windows and cross-environment reporting | Apply the same operation across a larger authorized estate | A customer is paying for the expanded scope |
| Enterprise operation | SSO, advanced secret integrations, retention controls, managed hosting and measured availability | Satisfy specific purchasing and operating requirements | A qualified deal and resources to deliver support |

Security and truthful outcomes are prerequisites throughout. Enterprise identity integrations and deployment scale can be staged; basic isolation and restricted execution cannot.

A later visual editor should round-trip with the definition format and preserve versioning. Add sub-workflows after template repetition makes them useful. Add event triggers after verifying duplicate events and permission boundaries. Add remote artifact transfer after a customer demonstrates a data-locality need. AI-assisted drafting can be investigated later, with human review and the same policy controls; it is not a requirement for the product or the launch message.

Explicitly defer general business-process automation, arbitrary agent-to-agent meshes, autonomous production remediation, universal rollback, data-pipeline backfills, GPU scheduling and hundreds of SaaS connectors. These would multiply the product's responsibilities before its first operation is proven.

## Engineering work packages

### A0 Specify the first operation

Map the customer's current procedure and a synthetic equivalent. Write input, action, target, output and recovery contracts. Define success from the application's perspective. Create a launch/run/recovery wireframe and a fault checklist. Proposed allowance: 8 to 12 engineering hours, without treating a mockup as an implemented product.

### A1 Build the durable coordinator

Add workflow versions, run and step models, validated transitions, transactional outbox and a bounded reconciler. Call the shared execution service rather than reimplementing agent dispatch. Implement one sequence and only the parallel join the procedure needs. Proposed initial allowance: 30 to 50 hours after the runtime contract is stable.

Acceptance: killing the coordinator between a state decision and queue delivery does not forget accepted work; duplicate queue delivery does not create a second logical step; two runs cannot read each other's outputs; an unknown required step blocks completion.

### A2 Build the operator and recovery interface

Implement parameter entry, target preview, version identity, run progress, per-target attempts, output validation and operator decisions. Include one approval path if the chosen operation requires it. Proposed allowance: 20 to 35 hours.

Acceptance: an authorized second person can launch the published operation, identify the failed machine and follow the defined recovery without editing shell commands. A denied operator cannot reach the action through a direct API call. Changing targets or material inputs invalidates approval.

### A3 Package the first paid procedure

Provide the tested template, synthetic environment, pinned deployment, operator guide, export, upgrade instructions and customer acceptance script. Connect the existing schedule system only through the shared launch path. Proposed allowance: 15 to 25 hours, plus customer-specific integration measured separately.

Acceptance: a new installation can run the fixture, reproduce a failure and export its record. The customer can remove access and keep its scripts. An update cannot silently change the version of an active workflow.

### A4 Add repeatability and controlled fleet execution

After paid evidence, add reusable templates, signed/pinned action packages where needed, a canary target, batches, health thresholds, resource-level concurrency and schedule windows. Allow customers to promote a tested version between environments with approval. Estimate this only after specifying one paid rollout; it is not a promise to deliver every fleet feature in the first release.

### A5 Make it operationally supportable

Add the telemetry and tools needed to inspect queue lag, unacknowledged attempts, unknown outcomes, policy denials, reconnects, notification failure and storage growth. Document backup/restore, key rotation, compatibility, incident response and decommissioning. Test retention and deletion, including artifact expiry. Add a support bundle with deliberate redaction, not unrestricted collection of host files.

Proposed acceptance: the operator can determine whether a problem is in the application action, agent, network or coordinator without asking Yash to inspect raw database records. A restored installation resumes or flags work correctly instead of replaying every historical action.

### Engineering estimates and the parallel work constraint

A0 through A3 total approximately 73 to 122 engineering hours beyond the shared runtime work, before unknown customer integrations and later fleet capabilities. The current-product plan now allows 100 to 180 hours for the shared foundation and initial polished customer journey, including a 20 to 40 hour UX addition. A2 already includes the initial automation operator/recovery UI. Do not add either the foundation or initial UI twice when budgeting both tracks.

The combined planning allowance is therefore roughly 173 to 302 engineering hours for a bounded automation pilot, with low confidence until the first vertical slice is implemented. At ten engineering hours weekly, that is approximately eighteen to thirty-one weeks when rounded up. At twenty weekly, it is approximately nine to sixteen weeks. These are effort arithmetic, not calendar promises. User interviews, dependencies and review can lengthen the calendar. The mature visual editor, fleet portal and enterprise features are outside these allowances.

This is why the revenue plan starts with a small current-product package and permits a separately scoped implementation using established tools. A complete automation platform should not be treated as a two-week UI project. At 25 total hours weekly, maintain one active engineering item and one pilot; do not commit to the same time twice across sales, delivery and two backlogs.

## Verification strategy

The existing implementation and workflow architecture notes are the baseline, not a completed durable workflow product. [^13] The [fresh technical audit](<C:/My Project/Axon/docs/axon-technical-audit-and-release-plan-2026-09-09.md>) includes current local build/test results and separates reproduced failures from static findings and unverified risks.

Test invariants before broad performance claims. A required step executes only after its own run's prerequisites; one attempt's result cannot complete another; a cancelled or unknown action cannot be reported as successful; an approval does not authorize a changed operation; and organization/environment boundaries hold through every API and subscription.

Use real Node, Rust, Redis and the supported MongoDB topology on Linux. The smallest fault environment needs two agent machines for identity and cross-target checks, plus the additional disposable roles for the full demo. Mock-based unit tests remain useful for pure transition logic, but they cannot establish transport or process behavior.

| Failure injected | Required product behavior |
|---|---|
| Agent receives action but acknowledgement is lost | Known duplicate attempt is not started twice; unresolved side effects become reviewable |
| Coordinator stops after recording a transition | Outbox and reconciler recover pending progress |
| Result is delayed until after retry | Result is attached to the original attempt and cannot overwrite the new one |
| Two workflow runs overlap on one environment | Resource policy serializes or rejects the conflict explicitly |
| Agent disconnects during a mutating action | Downstream work blocks until the outcome is known or reviewed |
| One parallel target fails | Required join does not pass; successful targets retain their evidence |
| Workflow is edited or credentials are revoked while paused | Pinned definition stays stable; current authorization is rechecked |
| Log or artifact exceeds its budget | Output is bounded and truncation is visible; control state remains valid |
| Redis loses queued wakeups | Durable pending records allow controlled rescheduling without new logical operations |
| Database persistence is unavailable | New work is not accepted or dispatched without its required durable record |
| Cancelled process leaves descendants | Cancellation remains unconfirmed until termination or uncertainty is recorded |
| Tenant identifier or URL is manipulated | Authorization or egress policy rejects the request before access or execution |

Test schedule edits, timezone boundaries, approval expiry, invalid input shapes, graph cycles, zero-target resolution, stale action versions, graceful updates and restoration. Property-based tests can explore transition sequences if they add coverage beyond hand-picked cases. Do not use a passing happy-path demo as proof of correctness.

Record dispatch latency, log delivery delay, reconciliation delay and control-plane resources under stated conditions. A useful initial target is responsive operation within the tested ten-agent envelope, with concrete measured numbers published after testing. Do not advertise a p95 or uptime value before measuring and operating it.

## The five minute demonstration

The demonstration is a future acceptance scenario, not a description of features already implemented.

| Time | Demonstration | Point the customer should understand |
|---|---|---|
| 0:00 to 0:40 | Show the existing checklist and the four roles/machines | An engineer currently coordinates several pieces |
| 0:40 to 1:20 | Select the test environment and fixture; show pinned actions and targets | The operator knows exactly what is about to run |
| 1:20 to 2:10 | Start and show sequential plus parallel steps | Existing scripts perform the work in the correct order |
| 2:10 to 3:10 | Drop one connection at a predetermined step | Partial success is visible; dependent work does not continue blindly |
| 3:10 to 4:20 | Inspect evidence and run the approved verification/retry path | Recovery preserves known results and handles uncertainty honestly |
| 4:20 to 5:00 | Finish health checks and export the record | The environment is ready and the team can explain what happened |

Prepare the injected failure to match the demonstrated recovery policy. If a command may have completed, first inspect its idempotency marker or approved verification result; do not show a magical resume that assumes it did not run. A prerecorded sequence can explain the vision before implementation, but it must be labeled a prototype and must not be sold as working functionality.

## Building in public and finding customers

Build in public to make the engineering understandable and give buyers something concrete to inspect. Do not expect regular progress posts to produce customers automatically. Every public effort should lead to a relevant conversation, a successful installation or feedback on a real operation.

Use the founder's professional LinkedIn presence for buyer-relevant stories, GitHub for code and releases, and one technical publishing channel for deeper explanations. Reuse the same substance rather than maintaining five separate content programs. A short video can accompany a release. Answer real community questions when useful, disclose the relationship to Axon and follow the community's promotion rules.

### Public release preparation

Confirm repository ownership and a coherent license, inspect the full publishable history and current files for credentials, remove customer material and rotate any exposed secrets. GitHub's secret scanning helps detect known secret patterns but does not replace a review for proprietary data or every secret type. [^9] Publish a threat model, supported operating envelope, installation instructions, a security reporting route, contribution expectations and known limitations. GitHub provides documentation for these community files. [^10]

Proposed licensing is the same Apache-2.0 core as the current product, with paid setup, maintenance and later managed hosting. Publish customer-neutral examples and keep customer scripts private unless explicitly authorized. Include notices and dependency terms. Apache's published license is the authority for redistribution conditions; this plan does not authorize relicensing code owned by others. [^11]

Provide an easy local sample and a synthetic walkthrough. A hosted public demo should be read-only or use narrowly isolated fixed fixtures, with no arbitrary remote commands or shared customer credentials. Do not require visitors to enter production secrets to understand the product.

Show HN is suitable when people can try the product; its guidelines exclude ordinary landing pages and discourage barriers such as signup. Reserve that launch for a working sample rather than a waitlist. Do not coordinate votes. [^12]

### Six release driven content pieces

| Piece | What to publish | Useful next action |
|---|---|---|
| 1 | Why a lost acknowledgement does not prove a command failed | Invite an engineer to challenge the execution contract |
| 2 | A runnable exact-host remote action with a nonzero-exit example | Try the local fixture and report installation friction |
| 3 | One server procedure expressed as reviewed steps | Share a comparable real procedure for a pilot assessment |
| 4 | A coordinator restart and recovered workflow state | Inspect the fault test and identify a missing failure case |
| 5 | Approval tied to a target snapshot and operation version | Discuss who currently approves the customer's maintenance work |
| 6 | A customer-approved case study with baseline and limitations | Book an assessment of one similarly costly operation |

Release-driven means the piece waits until its claim is true. Publish at most one substantial explanation and one short update weekly within the allocated time. A quiet engineering week does not need an invented milestone. Do not publish unfixed sensitive deployment details to create attention.

The public landing page should explain one operation, show the run and recovery screens, link the sample, list supported environments and offer a pilot conversation. Use separate links for "Try the sample" and "Discuss a paid implementation." Replace vague automation promises with a specific input, action and outcome. Put roadmap items in a clearly marked roadmap, not the live feature list.

### Outreach for automation

Start with the current-product prospects and users. Ask what they do immediately before and after an existing Axon job. A repeated answer is a stronger expansion signal than a new audience asking for unrelated features.

Draft message: "We have been working on running individual server scripts through Axon. I'm now looking at the complete procedure around them: selecting the environment, ordering the steps and recovering when one machine fails. Is there one operation your team repeats that still needs an engineer watching several systems? I can map it with you and scope a paid implementation if the benefit is clear."

Use the same researched, low-volume outreach and jurisdiction-specific rules as the current-product plan. Public replies, direct messages and email should all lead to the same prospect record. A request for an interview should not be disguised as an existing customer relationship. Do not send repeated messages through multiple channels after silence.

For a design partner, agree on a named procedure, environment, buyer, acceptance result, review cadence and payment. A design partner is simply an early customer helping shape the product; it does not mean free indefinite customization. Ask for two short feedback sessions and an acceptance review. Public case-study permission is optional and separate from buying.

### Measure customer progress

Track the path from relevant visitor to conversation, authorized evaluation, first completed operation, second operator, repeated weekly use, payment and renewal. Prefer customer-reported or opt-in activation data for self-hosted deployments; do not silently collect execution content. Define an active customer as one completing the agreed real operation during its expected cycle, not merely logging in.

Stars, followers, impressions and waitlist counts show attention. They do not establish ability to install, trust, pay or renew. After four substantive public pieces, inspect whether any qualified conversation or installation resulted. If none did, improve relevance and direct distribution before increasing content volume.

## Commercial model for automation

Use a paid implementation followed by maintenance for the first customers. Proposed opening quote: INR 60,000 for one tested workflow in one environment, covering the defined scripts, installation, failure testing and handoff. It is a price experiment and must be rescoped against actual delivery effort. General platform development is an investment in Axon, not an unbounded obligation hidden in the customer's pilot.

For a customer who already paid INR 30,000 for the current-product setup in that same environment, credit that setup against the INR 60,000 workflow package when it is reusable. The incremental quote would then start at INR 30,000. Do not charge twice for the same installation.

Proposed continued support is INR 15,000 monthly for the agreed workflow and installation, including the runtime support, up to two hours of scoped maintenance and defined weekday response. This replaces the INR 6,000 runtime maintenance for that installation; it does not stack on top. New workflows and environments are separately scoped. Provide no unlimited custom development or solo-founder 24/7 commitment.

A hypothetical customer saving twenty active hours monthly at an internal value of INR 1,500 per hour releases INR 30,000 of capacity. Subtract INR 15,000 support for INR 15,000 modeled monthly value, before other new customer operating costs. INR 60,000 setup would then have roughly four-month modeled payback. If the customer cannot support the time assumptions, the quote or the use case must change. These are example economics, not observed customer results.

Delay a generalized software-only pricing table until several customers demonstrate the value unit. A base fee per operated installation or customer environment with supported capacity bands is a better initial hypothesis than charging every operator seat; letting another teammate run an approved task is part of the value. Paid managed hosting later charges for infrastructure operation and support as well as software. Free self-hosting can remain useful without a service commitment.

Three customers at INR 15,000 produce INR 45,000 gross monthly support revenue; five produce INR 75,000. Budget delivery, support, infrastructure, acquisition and taxes before interpreting this as personal income. Keep customer-specific support below the contractual allowance or revise scope. If every new operation requires many bespoke days and no reusable product emerges, manage it as a service business rather than reporting fictional software margins.

## Investment gates and decisions

| Gate | Evidence sought | Decision |
|---|---|---|
| Problem | Several independent teams describe the same repeated operational burden | Continue the narrow procedure hypothesis |
| Commitment | At least one customer agrees a paid scope and authorized environment | Build the necessary procedure after runtime readiness |
| Product | Three similar paid implementations share most of the core behavior | Invest in reusable templates and easier onboarding |
| Retention | At least two customers continue using and paying over relevant operating cycles | Expand the supported product and customer acquisition |
| Scale | Measured load or a qualified deal exceeds the supported envelope | Scope availability, hosting or fleet features deliberately |

These are proposed decision rules, not statistical proof. Customer silence may reflect poor targeting or trust rather than no market; investigate those causes. Conversely, a large public audience does not justify crossing a gate without a buyer.

Stop or change the automation scope if qualified teams consistently prefer existing tooling, the procedure happens too rarely, security approval exceeds its value, users cannot maintain definitions, or recovery is impossible to explain safely for the chosen action. If a required application change is irreversible and cannot be checked, it may be unsuitable for Axon's first product.

The strongest engineering objection is that building a reliable workflow system is substantial work. The response is a restricted language, shared execution contract, failure tests and a willingness to adopt an established orchestrator if the custom coordinator exceeds its budget. The strongest business objection is that competitors already serve the category. The response must be a specific operation and measured customer preference, not more feature names.

## Operating plan for the next ninety days

Use the current-product plan's single weekly time budget. Automation starts alongside customer discovery as A0: map procedures, write contracts, review the graph design and produce a clearly labeled synthetic prototype. It does not receive an independent full-time budget while the runtime still needs correction.

During the first month, complete A0 and obtain real procedure examples. Continue the shared runtime vertical slice. Publish only verified current behavior and explain future behavior as a design. Request a paid pilot after a procedure and its authority are clear.

During the second month, begin A1 when the shared contract is usable and a customer need justifies it. Keep current-product installation and support ahead of optional authoring features. Use the smallest launch/run view required to demonstrate the complete procedure.

During the third month, complete A2 and A3 only if available engineering capacity and the gates allow it. Otherwise continue the accepted current-product business and update the automation estimate openly. A first automation pilot is a possible outcome, not a deadline that overrides correctness.

At every weekly review, answer five questions: which real operation improved, what was paid, which failure remains unsafe, how many hours support consumed and which next item directly changes customer value. Drop or postpone features with no concrete answer. After the first accepted procedure, seek the second similar customer before generalizing to unrelated operations.

## Sources

Sources were checked on 9 September 2026. The architecture, limits, estimates, price points and investment gates are proposals. Implementation must verify library APIs against installed versions and test the actual deployment topology.

[^1]: Windmill, [Axians case study](https://www.windmill.dev/case-studies/axians-content), 2 February 2026. Vendor-published account of customer-environment orchestration.
[^2]: Windmill, [Zoom case study](https://www.windmill.dev/case-studies/zoom), 23 February 2026. Vendor-published account of repeatable demo preparation.
[^3]: Windmill, [Agent workers](https://www.windmill.dev/docs/core_concepts/agent_workers) and [Architecture and data exchange](https://www.windmill.dev/docs/flows/architecture). Current remote execution and flow documentation.
[^4]: Rundeck, [Job workflows](https://docs.rundeck.com/docs/manual/jobs/job-workflows.html). Current operational workflow documentation.
[^5]: Octopus, [Runbooks](https://octopus.com/docs/runbooks/). Current self-service operations and approval documentation.
[^6]: Temporal, [Activities](https://docs.temporal.io/activities). Activity execution and idempotency requirements; basis for evaluating an established orchestration alternative.
[^7]: MongoDB, [Production considerations for transactions](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/). Transaction deployment requirements.
[^8]: BullMQ, [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs) and [Idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs). Retry behavior and action design.
[^9]: GitHub, [Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning). Repository secret detection and its scope.
[^10]: GitHub, [Setting up a project for healthy contributions](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions). Repository policies and community files.
[^11]: Apache Software Foundation, [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html). License authority for the proposed publication model.
[^12]: Hacker News, [Show HN guidelines](https://news.ycombinator.com/showhn.html). Runnable-product and submission requirements.
[^13]: Local [workflow design](<C:/My Project/Axon/docs/workflow-architecture.md:43>), [dependency service](<C:/My Project/Axon/backend/services/dagStateManager.js:13>), [current product plan](<C:/My Project/Axon/docs/axon-current-product-plan-2026-09-09.md>) and [technical assessment](<C:/My Project/Axon/docs/project-understanding-2026-09-08.md>). Current implementation baseline and known limitations; this document is a plan, not a completed implementation.
