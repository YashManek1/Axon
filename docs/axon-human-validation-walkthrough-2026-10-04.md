# Axon human validation walkthrough

Prepared 4 October 2026. **Not performed.** Yash currently has neither a second operator nor a screen reader available. This protocol is preparation, not accessibility, usability or pilot acceptance.

## Safe setup

Use a separately authorized, disposable non-production environment and harmless procedures. The connected-agent acceptance runner cleans up its fixtures; it is not a standing demonstration environment. Do not reuse customer databases, credentials or machines, leave the acceptance stack running, or disable approval/containment for this walkthrough.

An engineer must first establish three saved fixtures: confirmed success (exit 0), confirmed failure (nonzero exit), and an honestly uncertain UNKNOWN outcome. Never relabel a known result UNKNOWN or damage a live system to create the third example. If an authentic UNKNOWN fixture is unavailable, mark that case not tested. The staging-version example is uninstalled guidance, not a ready-made validated customer operation.

Record date, source revision, OS, browser/version, reader/version and operator role. Use pseudonyms; do not record credentials, customer identifiers or raw command output. Record each case as PASS, FAIL or NOT TESTED, with observations and assistance required. A browser accessibility tree is not a screen reader.

## Screen-reader and keyboard session

Use an actual reader such as Windows Narrator or NVDA. Have the engineer observe without taking over. Try keyboard-only first, then the reader's heading, landmark and control navigation. Repeat essential cases at 200% browser zoom and a narrow viewport.

1. Start at the landing page. Find the skip link, product explanation and labelled example. Explain what is real and what is only an illustration. Navigate theme and example controls: focus stays visible, names are understandable and changing the example executes nothing.
2. Sign in to the isolated environment. Find Operations, select the harmless procedure, and identify its purpose, exact machine and expected result. The operator must not confuse a version-file check with a service-health check.
3. Open review. Read the server-bound preview, command and target before explicit confirmation. Check that loading, expired/denied preview and errors are understandable, that stale details are not actionable, and that opening or dismissing review creates no run.
4. Confirm once. Understand that acceptance/queueing is not successful completion. If the response is uncertain, retain the original identity and investigate; do not blindly confirm again or select a different target. Record focus and announcements after the response.
5. Inspect each available saved result. Explain success, confirmed failure and UNKNOWN in plain language. For UNKNOWN, the correct answer is that effects cannot be confirmed and the machine/evidence need inspection before any repeat. Record whether the warning is encountered without sight.
6. Prepare a saved-run handoff, inspect the sanitized preview, then explicitly copy the reviewed summary. Check the copy result/error announcement and focus. Confirm no automatic clipboard write, no secrets/raw logs in the summary, and no stale summary remaining actionable after evidence/permission changes. Permission changes are made only by the authorized engineer in this disposable environment.
7. Leave and return to the detail screen. Check logical focus order, dialog exit/Escape where supported, no keyboard trap, meaningful headings and no disappearing critical guidance at zoom/narrow width.

For every defect, capture route, control, expected behavior, observed reader speech/focus and a sanitized screenshot if helpful. Do not publish a reader transcript containing sensitive data.

## Independent second-operator session

Use another authorized human who did not build Axon. Give only this task: “Find the recorded staging version on this approved non-production machine and prepare a handoff.” Do not tell them where to click. The engineer intervenes before unsafe action; record the intervention rather than counting the case as independent success.

Ask the operator to identify the purpose, chosen machine, expected result and approval boundary; complete the harmless check; locate saved evidence; and prepare the handoff. Then show the uncertain fixture and ask what they would do next. Record completion time, confusion, help requested and whether they know when to stop for an engineer. One session does not prove reduced interruptions or return on investment.

## Evidence template

| Case | Result | Observation / assistance | Follow-up |
| --- | --- | --- | --- |
| Landing explanation and example boundary | NOT TESTED | | |
| Keyboard navigation / focus / zoom | NOT TESTED | | |
| Preview and explicit approval | NOT TESTED | | |
| Accepted is not completed | NOT TESTED | | |
| Success and confirmed failure | NOT TESTED | | |
| UNKNOWN and no blind repeat | NOT TESTED | | |
| Reviewed handoff and copy feedback | NOT TESTED | | |
| Permission / stale-content behavior | NOT TESTED | | |
| Independent second-operator task | NOT TESTED | | |

An independent reviewer accepts the recorded findings and verifies fixes before these gates close. This protocol does not validate safe retry/hold resolution, installation/restore, real multi-host operation, buyer demand or willingness to pay. See the live tracker for those separate gates.
