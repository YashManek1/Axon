# Axon Customer Experience, UI/UX Features and Product Knowledge Base

9 September 2026. This is the design and implementation specification for both product stages. Features described as proposed are not implemented by this document. The existing interface assessment is based on source review, not a new visual browser audit.

## The experience we should build

**“Connect your servers, choose an approved operation, and know exactly what happened.”**

Axon should feel like a finished tool a customer can use without its author explaining every screen. Looking good means readable information, clear hierarchy, consistent interactions and useful feedback. It also means a convincing first experience: an engineer can bring an existing script, run it on the right machine, inspect the outcome and give a teammate a safe way to repeat it.

The current product makes **one remote operation** easy and trustworthy. Automation makes **a complete multi-server procedure** easy and trustworthy. Use one design system, navigation structure, installation flow, action library and run history. Automation adds a procedure builder and richer recovery; customers should not learn a second unrelated application.

Yash's server/tree graph is included. So are guided setup, templates, simple launch forms, target previews, a failure inbox, run timelines, searchable history, schedules, controlled delegation, version comparison and client-ready records. Each feature must earn its place through a user task. Attractive screens can help a prospect understand the product; they do not establish willingness to pay.

## What real products teach us

These are sourced patterns and our resulting design decisions. They are not controlled experiments demonstrating that any particular screen increases sales.

| Evidence / observation | What it teaches us | Axon decision | What to validate with customers |
|---|---|---|---|
| Rundeck exposes execution summaries, node/step status, logs and individual execution URLs [^1] | Users need several levels of detail and a shared reference for one run | One run page with Summary, Targets, Logs and History; permission-checked deep links | Can an operator explain a failure without opening a terminal? |
| n8n offers execution search and workflow history in paid plans; its earlier product announcement describes execution filtering [^2] | Finding the relevant past run is part of operating automation, not merely authoring it | Search/filter by operation, environment, status, time and actor; preserve versions | Which filters help users answer real support questions? Paid packaging does not isolate demand for one feature |
| Windmill's Zoom case describes reusing existing scripts behind a self-service demo platform [^3] | A simple front end over existing engineering work can matter more than teaching a new language | Typed launch forms over approved existing scripts; template-based first experience | Will a second teammate actually use the form independently? |
| Windmill's Axians case emphasizes separate customer workspaces and controlled execution [^4] | Environment identity and isolation must remain obvious while operations are reused | Persistent customer/environment context, explicit target preview and scoped catalog | Can a user detect a wrong environment before launch? |
| Semaphore already provides an accessible self-hosted automation UI [^5] | A nice dashboard over shell/Ansible is an existing category | Compare the same real procedure against Semaphore, Windmill or the customer's current tool | Does Axon remove enough work to justify another service and agent? |
| React Flow supplies keyboard/screen-reader support; layout is an additional design/library choice [^6][^7] | A graph library supplies primitives, not a finished usable product | Accessible graph plus list view, predictable auto-layout, clear edge semantics | Can users identify a blocked machine/step without manipulating a large canvas? |
| W3C guidance covers contrast, target sizes and accessible status announcements [^8][^9][^10] | Faint text, tiny buttons and silent state changes exclude users | Accessible tokens, visible focus, practical click targets and useful live announcements | Keyboard, zoom, narrow screen and screen-reader checks on the actual product |

The knowledge base should grow from customer evidence: save the observed task, current workaround, example artifact, time/failure cost, objection, proposed improvement and whether the customer used/paid for it. Mark entries **fact**, **inference** or **hypothesis**, with source and date. A sales anecdote or a competitor feature must not quietly become a verified Axon requirement.

## Existing interface: keep the useful work

Keep the React/TypeScript application, reusable panels, theme support, tables, accessible button labels, toast/confirmation components, query caching and existing responsive layout. There is no reason to rewrite the frontend framework. The current Overview already contains a first-run guide, and Jobs/Agents/Audit provide useful starting screens.

Change the first-run guide from “visit Settings, generate a key, fill an agent form” into a complete installation journey. The current agent form asks for a hardware UUID and shows placeholder install details. Those should be generated or discovered by the supported installer. A user should understand whether installation, enrollment, connectivity, policy or execution verification failed.

Fix misleading states before designing richer ones. Overview calculates full-day totals from a limited recent list. Agent cards use `status !== "offline"` as the online test and supply default OS/metrics when information is missing. The shell shows a decorative health dot and unfinished search chrome. Treat unknown data as unknown and incomplete interactions as incomplete.

The token values in [index.css](<C:/My Project/Axon/frontend/src/index.css:1>) also need attention: `#475569` on `#060d1a` has approximately **2.57:1** contrast; `#64748b` on that background is approximately **4.09:1**. These calculations indicate unsuitable combinations for ordinary small information text against that background, whose WCAG AA target is 4.5:1. This is a token-level calculation, not a claim that every use has that exact rendered background. [^8]

## Navigation and page structure

Use these product names in the interface: **Overview, Servers, Actions, Runs, Schedules, Settings**. Add **Procedures** when automation exists and **Needs attention** as a count/link to filtered runs. “Agent” remains available in server detail and technical documentation. The user cares first about `acme-demo-web-02`, not its internal agent object ID.

At the top, always show customer/installation, environment and connection freshness. For the first dedicated installation these may be fixed labels. Do not build a fake organization switcher before multiple environments are supported. When switching later, reset target-dependent inputs and require a new preview; never silently retain selections from another customer.

Inside a page: title and short purpose → primary action → urgent information → useful content → optional diagnostics. One visually dominant action at a time. Settings are organized into Access, Servers, Actions policy, Notifications, Data/retention and Installation health as those capabilities become available.

## Feature plan for the current product

R0 is the first polished bounded pilot. R1 follows evidence from actual use. An R1 item becomes required earlier if it is part of the signed pilot scope. A label in a roadmap is not permission to promise an unfinished feature.

| Feature | Exact customer-facing behavior | Why a customer cares | Stage / engineering dependency |
|---|---|---|---|
| Guided installation | Choose supported OS; copy verified installation steps; see Downloaded → Enrolled → Connected → Safe test passed; actionable errors at each step | Reduces setup calls and proves the first outcome | R0; versioned installer, scoped enrollment, actual health and action checks |
| Server list and connection map | List/card/map toggle; names, environment, connection age, allowed actions, version and current work; select a server for detail | Understand what is connected and which machine needs attention | R0 basic list + small map; exact identity/freshness API first |
| Action library | Three installed actions with a useful name, purpose, inputs, affected resource, owner, last result and repeat-safety note; favorites later | “Collect service health” is easier to use than remembering a command | R0; administrator-defined versioned action contract |
| Setup templates | Start with safe service-health check, application-version check and approved diagnostic collection; show requirements and expected output | Gives a new customer something useful immediately | R0 three tested examples; each customer still supplies approved paths/dependencies |
| Simple run form | Required inputs first, sensible saved non-secret defaults, inline validation, examples, advanced settings collapsed | Replaces editing shell arguments and repeatedly asking the author | R0; schema-backed inputs validated on server and agent boundary |
| Target and impact preview | “Run Collect service health v3 on Acme / Demo / web-02”; show exact server, action, input summary, permissions and expected effects | Prevents wrong-server mistakes; makes the launch understandable | R0; server-generated preview bound to action version and resolved targets |
| Preflight checks | Show missing action/version, stale agent, invalid input, unavailable dependency or insufficient permission before dispatch | Finds predictable failures before the customer waits | R0; checks have a timestamp and can become stale. Do not claim a guaranteed dry run for arbitrary scripts |
| Run page | Clear result, target, start/elapsed time, actor, action version, current stage and output summary; expandable logs/attempts | Answers “did it work?” immediately | R0; immutable run identity and honest outcome states |
| Useful failure explanation | Explain what failed, which server was affected, what is known and the next permitted action; include copyable diagnostic ID | Cuts support round-trips and fear of clicking again | R0; stable error codes mapped to contextual text, raw detail remains available |
| Safe retry/recovery | Retry only an eligible failed action; uncertainty gets “Check outcome” and instructions. Explain what reruns before confirmation | Prevents repeating an operation that may already have changed the server | R0 basic recovery; idempotence/reconciliation and attempt history required |
| Searchable run history | Filter by action, server, status and period; direct run link; use browser Back without losing filters | Finds evidence for a colleague/client or a past failure | R0 basic filters; paginated scoped API, URL state |
| Handoff record | Copy a concise result summary and download a redacted record with run ID, target, times, actor and outcome; print-friendly view | Helps an agency demonstrate work to its customer | R0 basic export; no unauthenticated public logs or fabricated compliance claim |
| Attention inbox | List failed, unknown, overdue and waiting runs with owner/next action; one event per incident rather than endless repeated toasts | Makes the home page operationally useful | R1; start R0 with a truthful filtered list; persisted acknowledgement when needed |
| Schedule builder | “Weekdays at 09:00 Asia/Kolkata”; show next five occurrences, pause/resume, missed-run and overlap policy | Removes cron syntax mistakes and surprises | R1 or R0 if promised; tested scheduling behavior from audit T12 |
| Failure notifications | One chosen channel initially, with environment, action, reason and run link; test-delivery button and per-action preferences | Lets users leave the dashboard | R1 or earlier when included; authorized recipients and reliable delivery status |
| Working command/search palette | Ctrl/Cmd+K searches allowed servers/actions/runs and navigates; it does not bypass preview for mutations | Saves repeated navigation for frequent users | R1; omit the decorative fake search until functional |
| Saved views and recent inputs | “Acme failures”, “My recent operations”; reuse non-secret parameters with current target validation | Makes everyday use fast after onboarding | R1 after repeated usage, no cross-customer cache leakage |
| Customer report | Period, operations performed, outcomes, unresolved issues and measured operator time; agency identity in a simple header | Gives the buyer evidence of the service's value | R1; no invented savings, no full white-label portal initially |

These features are not all separate modules. Run detail, recovery, copy summary, history and notifications all use the same run record. This keeps the small product coherent and limits implementation cost.

## The two graphs, precisely

### Server connection map

Shows infrastructure membership/connectivity: **Axon control plane → environment group → server agents**. A line means “this server has a connection to this control plane” or a labeled grouping relationship. It does not imply a direct network route or peer-to-peer communication between servers. Never fabricate a topology from shared organization membership.

Each node has a human name, status icon plus text, last-seen age, version/policy warning and current-run count. CPU/RAM are secondary details, not the first story. Selecting a node opens a right-side panel with permitted actions, recent runs and troubleshooting. Filters include environment, label and attention state. Provide Fit view, zoom, search, collapse group and List view. Preserve layout when heartbeats update; do not move nodes while someone is reading.

For the first five-server pilot, a simple auto-layout is enough. Empty state is “Connect your first server,” not a blank canvas. A disconnected socket is labeled disconnected; stale telemetry is labeled stale; an unavailable control plane does not make all servers healthy or dead by assumption.

### Procedure graph

Shows **steps and their dependencies within one procedure version or one run**. A step contains the assigned server/environment chip. Arrows mean “wait for this step” or explicitly labeled data dependency. Parallel branches rejoin only under the procedure's declared rule. A tree is useful for nested sub-procedures, but a workflow with parallel joins is a directed graph rather than necessarily a tree.

In run view, every node shows current state, duration and outcome; clicking shows input/output, target and attempt history. The current blocking step is easy to locate. Multiple-server fan-out is summarized as “3 of 4 completed, 1 needs review,” expandable into individual targets. Do not paint the whole branch green because one target completed.

The default editor is **template → form → ordered steps**, with a graph preview. Most first customers should not need to draw edges. Add drag/drop graph editing once authors repeatedly need it; persist layout separately from execution semantics. Draft changes cannot alter a running or published version. Export/import must preserve meaning and validation, not merely node coordinates.

Proposed implementation: evaluate the MIT-licensed React Flow core for selection, viewport and accessibility; a simple DAG layout such as Dagre for initial steps; consider ELK only if compound layouts justify its cost. Layout examples are not a requirement to buy Pro templates. Check licenses for any copied example separately. Lazy-load the canvas; a list/stepper remains available on small screens and to keyboard users. [^6][^7]

## Automation: the additional experience

The first complete procedure is **prepare an application demo/test environment using synthetic fixtures** across several machines. It is a controlled example with application-specific success checks, not a promise to safely reset any customer's production database.

| Feature | Concrete behavior | User benefit | Sequence |
|---|---|---|---|
| Procedure catalog | “Prepare demo”, with purpose, estimated duration from observed runs, required environment, owner and published version | A teammate launches an outcome without understanding infrastructure wiring | First automation pilot |
| Guided procedure authoring | Start from the customer's proven action sequence; choose steps, targets, input mappings and required final checks | Removes repeated script glue while preserving familiar actions | First pilot; only needed sequence/parallel join |
| Data mapping inspector | Pick a named output such as `fixtureId` from a previous step; show type/example, required vs optional and secret status | Makes information passing understandable without pasting JSON paths blindly | First pilot for needed outputs |
| Definition validation | Detect cycles, missing outputs/actions, incompatible types, unauthorized targets and unhandled failure paths before publishing | Finds mistakes while editing | First pilot; server validation authoritative |
| Versions and readable changes | Compare changed steps, targets, parameters and policy between draft and published version | Reviewer can assess the change without a raw JSON diff | Version binding first; richer diff after recurring author changes |
| Approval card | Show requester, immutable version, affected targets, material inputs, risk, expiry and reason; Approve/Reject recorded | A senior engineer can delegate a specific operation | When procedure requires approval; bind approval to exact preview |
| Live step timeline and graph | Current step, blocked reason, per-target status and elapsed time; logs below the summary | Replaces humans asking each other whether a prerequisite finished | First pilot |
| Recovery workbench | Compare planned/completed/failed/unknown steps; show outputs retained and effects that require verification; preview eligible continuation | Reduces manual reconstruction after partial failure | First pilot for actual failure cases; no generic “retry everything” |
| Postcondition checks | “Service responds with expected version and fixture ID,” separate from command exit success | Makes the business outcome visible | First pilot; checks defined per procedure |
| Reusable sub-procedures | Publish a tested sequence once and pin its version inside other procedures; tree view of nested runs | Avoids copy/paste as real procedures multiply | After repeated reuse across paid implementations |
| Controlled fleet launch | Exact resolved target set, one canary, bounded batches, wait/health checks, stop criteria and progress per environment | Enables larger changes without blindly changing every machine at once | After paid fleet demand and stronger release gates |
| Delegated operator portal | A user sees only permitted published procedures and a form; execution/history access is scoped | Lets support/customer-facing staff handle approved work | After pilot demonstrates a second user role needs it |
| Calendar, ownership and approvals inbox | Upcoming maintenance, missed runs, blocked approvals and accountable owner | Coordinates team work across time | After schedules and delegation become recurring |
| Measured value view | Compare before/after manual time for a procedure, completed outcomes and remaining exceptions | Helps buyer decide whether to renew | After a measured baseline; label estimates and samples |

Do not add open-ended AI agents, arbitrary peer chat, a marketplace, hundreds of connectors, a universal rollback button, white-label billing or autonomous production repair to make the screen look bigger. Add AI assistance only if customers later need help drafting/understanding procedures and it can remain behind the same review, data-access and execution controls.

## Exact customer journeys

### First remote action

1. The owner opens the setup checklist: installation healthy, one owner identity, no servers connected. There is one primary action: **Connect a server**.
2. They choose the supported Linux recipe. Axon provides an expiring enrollment method, verifies the artifact and detects host identity. The page waits for the identified machine rather than asking them to paste internal IDs.
3. The server arrives as `acme-demo-web-02`. Axon shows what account it runs under and which actions are allowed. **Verify connection** runs a safe installed check.
4. They choose **Collect service health**. The form asks for an approved service name; it does not expose arbitrary shell text to an operator.
5. Preview shows the environment, exact server, action version and permissions. Button text is **Run on web-02**, not a vague “Submit”. If evidence is stale, Axon explains and refreshes preflight.
6. The run page shows queued/acknowledged/running/result stages truthfully. Once complete it presents the check results and a **Copy summary** button. The user can open raw logs if needed.
7. If it fails, the page identifies the reason, preserves input and target context, and offers only safe next actions. A lost connection after dispatch is an unknown outcome until reconciled, not a convenient failure label.

### First multi-server procedure

The author assembles the approved environment-preparation steps and tests a disposable environment, including a deliberate failure. They publish version 1. Another operator chooses the environment and fills a small form. Axon previews all affected machines, runs the permitted steps, pauses on a failed prerequisite, and explains what remains untouched. After the supported recovery, final application checks pass and the operator copies a readable completion record.

This journey is the five-minute sales demonstration. The strongest moment is the operator understanding and recovering a partial failure without asking the original author what happened. A moving graph supports that moment; animation is not the proof.

## Run screen wireframe and content contract

```text
Acme / Demo                         Connected · updated 2 seconds ago
Prepare demo                 Run AX-1042 · published v3 · requested by Mira
NEEDS REVIEW                 web-02 disconnected after acknowledging step 3

[Summary] [Steps and targets] [Logs] [History]

1 Validate inputs       Complete       control plane
2 Load synthetic data   Complete       data-01
3 Refresh application   Unknown        web-02       [Inspect]
4 Verify environment    Blocked        check-01     Waiting for step 3

What we know: web-02 accepted step 3. Its completion result has not arrived.
What to do: reconnect and verify the application version before continuing.
[Check outcome]   [Open server details]   [Copy handoff summary]
```

This is proposed content, not a screenshot of working software. “Check outcome” must perform a supported verification, not merely turn unknown into success. It records who reconciled the outcome, which check ran and its evidence. If verification is impossible, the page says so and retains the uncertainty.

Shared state vocabulary: queued, waiting for server, running, waiting for approval, succeeded, failed, needs review/unknown, cancel requested, cancelled, skipped and expired. Map internal codes into these deliberately. Show “3 of 5 steps complete” rather than an invented time-based percentage. An estimate derived from history is labeled an estimate with sample size; omit it when data is insufficient.

## Visual system and interaction rules

Use the existing blue accent and neutral surfaces with stronger text contrast. Keep both light and dark themes. Proposed scale: 14–16px body text, 12–13px secondary information, 24–28px page titles; 4/8/12/16/24/32 spacing steps; consistent 6–8px radii. Use a normal UI font for prose and monospace for IDs, commands and logs. Avoid all-caps microtext for information users must read.

Use blue for active work, green plus a check/text for confirmed success, amber plus explanation for review/uncertainty, red plus failure text for confirmed failure, and neutral for blocked/skipped. Do not rely on color alone. Reserve animation for a real active state, keep it subtle and honor reduced-motion preferences. Do not animate idle network edges as though traffic is observed.

Practical button target goal is 40px or larger for primary controls, with sufficient spacing; do not scatter 14px click targets inside a crowded graph. Check the applicable WCAG target-size rule and exceptions rather than claiming a pixel size alone certifies the product. Keyboard focus must be visible, dialogs must manage/restore focus, and updates must be announced without reading every log line aloud. [^9][^10]

At laptop sizes, show content and contextual detail together. At 768px, detail becomes a drawer. At 390px and at browser zoom, monitoring and safe forms remain usable; procedure authoring can offer a step list instead of a squeezed canvas. Validate at 1440, 1280, 768 and 390 widths and 200% zoom. These are acceptance targets, not claims that the current UI already passes them.

## Every feature needs these non-happy states

| State | Required behavior |
|---|---|
| Loading | Stable skeleton/layout; do not show zero failures before the request returns |
| Empty installation | A concrete next step and tested example; no unexplained empty chart |
| No matching results | Keep filters visible; offer clear/reset filters rather than installation advice |
| Failed fetch | Explain data could not load; preserve safe cached values with age; retry control |
| Disconnected/stale | Visible banner and last update; disable launches that require fresh validation |
| Permission denied | Explain the missing permission or owner to contact without exposing forbidden resource details |
| Unsupported capability | Explain missing agent/action version and safe upgrade path; do not dispatch anyway |
| Expired logs | Preserve run summary and state retention boundary; empty output does not mean no output |
| Duplicate submission | Server-issued request/operation identity prevents another logical launch; UI shows the existing run |
| Unsaved edit | Draft persists or a clear leave warning; running/published definitions remain unchanged |
| Successful operation | Show meaningful result, next useful action and a handoff record; no forced celebratory interruption |

## Implementation sequence and API dependencies

**U0 — define and prototype:** choose one action and procedure; specify names, states, errors, layouts and keyboard behavior using synthetic data. Walk through success, known failure and unknown outcome with five relevant users. Preserve findings in this knowledge base. Do not present their enthusiasm as sales validation.

**U1 — shared current-product interface:** improve existing setup, Servers, Actions, Runs and result pages; add the basic map/list and launch preview. Needs the technical audit's T01–T08 execution/authorization contract, T15–T18 usability corrections and installation evidence. Introduce shared StatusBadge, EnvironmentContext, TargetPicker, RunSummary, AttemptTimeline, LogViewer and Empty/ErrorState components instead of separate custom implementations on every page.

**U2 — first automation interface:** add published procedure identity, template/form authoring, graph/stepper, required data mapping and recovery. It depends on durable run/step state and output contracts, not simply adding graph nodes to React. The automation A2 budget includes its initial run/step/recovery UI; avoid billing this work twice in planning.

**U3 — product refinements after use:** richer search, saved views, reports, version comparison, delegation and required schedule/notification controls. Choose the next item from observed repeated friction or a paid scope, not the size of this table.

Proposed API capabilities include scoped server inventory with capabilities/freshness; versioned action catalog; input/target preview; idempotent run creation; paginated run history; run/attempt event cursor; eligible recovery actions; aggregate period statistics; and sanitized export. These are capabilities to design, not claims that those endpoints already exist. Current `jobsAPI.runNow(id)` cannot power an exact-target preview without backend changes.

Keep URL filters and selected run IDs for shareability. Query/cache keys include tenant/environment when switching becomes possible; clear sensitive cache at logout. Treat event order explicitly using IDs/sequences and authoritative snapshots. Logs stay bounded; render only a visible window for large outputs. Pause unnecessary background polling, back off on errors, and show freshness when disconnected. Bundle graph code separately from login/landing pages.

## How we know the UX is working

Use five people close to the target users, preferably including someone who did not author the script. Give them a task and observe without coaching. These are proposed acceptance targets, not statistical proof from five users:

| Task | Proposed success measure |
|---|---|
| Connect a compatible clean server and run a safe check | At least 4 of 5 finish with documentation and no live founder intervention; investigate the time spent at each step |
| Run a provided action on the correct server | Every participant identifies the exact customer/environment/target before dispatch; any wrong-target launch is a release blocker |
| Explain a deliberately failed run | At least 4 of 5 correctly identify the failed step/server and permitted next action within 60 seconds |
| Handle an unknown outcome | No participant is encouraged by the UI to blindly replay a potentially completed unsafe effect |
| Find a past run and hand it off | At least 4 of 5 locate it and produce a useful summary within two minutes |
| Use keyboard and narrow layout | Core journey remains operable and understandable; no inaccessible canvas-only information |

The business checks are separate: did this replace a real manual task, did another teammate use it later, did support effort stay manageable, and did the buyer pay/renew? A beautiful interface that nobody returns to is an unsuccessful product experiment. A graph users ignore can remain secondary; a run explanation that reduces recurring support work deserves more investment.

Instrumentation, if a customer permits it, records milestones and durations without command text, credentials or logs. Private installations should work with external analytics disabled. Interview notes and measured before/after task time can supply early evidence without a large product analytics service.

## Scope and budget discipline

Include U0/U1's bounded pilot slice in the revised current-product allowance of **100–180 engineering hours**: the earlier 80–140 shared foundation plus 20–40 for the initial UX addition. Treat that addition as one allowance, not one per table row. If even the small map threatens the safety work, ship the same truthful server list first and finish the map before promoting it in demonstrations.

Automation's first operator/recovery interface stays within its separately proposed A2 scope; a mature drag/drop editor, fleet cockpit, client portal and enterprise integrations are later investments and are not covered by the pilot estimates. Re-estimate after the first integrated slice and actual user testing.

The order is: **a useful action → understandable result → easy first use → reliable repeated use → broader procedures → fleet polish where customers pay for it**. The product should look coherent at every stage, with unavailable features absent or clearly marked. We are designing the full direction while shipping only complete, supportable customer journeys.

## Sources

[^1]: Rundeck, [Executions](https://docs.rundeck.com/docs/manual/07-executions.html), checked 9 September 2026.
[^2]: n8n, [Cloud subscription features](https://support.n8n.io/article/n-8-n-cloud-subscription-features-per-tier), checked 9 September 2026; [Execution Search and Global Variables announcement](https://blog.n8n.io/introducing-execution-search-and-global-variables-new-features-to-streamline-your-n8n-workflows/), 12 May 2023. The announcement is historical product evidence, not a current pricing reference.
[^3]: Windmill, [Zoom demo platform case study](https://www.windmill.dev/case-studies/zoom), 23 February 2026. Vendor-authored customer account.
[^4]: Windmill, [Axians case study](https://www.windmill.dev/case-studies/axians-content), 2 February 2026. Vendor-authored customer account.
[^5]: Semaphore UI, [Professional self-hosted dashboard](https://semaphoreui.com/pro), checked 9 September 2026.
[^6]: React Flow, [Accessibility](https://reactflow.dev/learn/advanced-use/accessibility), checked 9 September 2026. Accessibility primitives require correct application integration and testing.
[^7]: React Flow, [Layouting overview](https://reactflow.dev/learn/layouting/layouting), checked 9 September 2026.
[^8]: W3C, [Understanding contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), checked 9 September 2026.
[^9]: W3C, [Understanding target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), checked 9 September 2026.
[^10]: W3C, [Understanding status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), checked 9 September 2026.
