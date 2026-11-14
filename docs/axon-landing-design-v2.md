# Axon landing, brand and theme v2

Decision: 4 October 2026. Implementation contract, not acceptance or a release promise.

## Outcome and audience

Within the first screen, a small infrastructure agency or engineering team should understand: Axon brings a reviewed Linux server task, its exact target and its recorded result into a shared workspace. The useful hypothesis is letting an authorized teammate perform a routine check without reconstructing instructions from chat. Reduced interruptions, adoption and willingness to pay remain unvalidated.

Approved hero direction: **“The server task. The right machine. A clear handoff.”** Plain explanation directly below: “Axon gives your team one place to review a Linux server command, confirm where it will run, and inspect the result.” Supporting line: “For teams turning repeatable checks into a shared way of working.” Terra may refine rhythm, but must retain product category, audience and concrete action.

## Story and information hierarchy

1. Compact real Axon mark and wordmark; navigation to workflow, outcomes and fit; working theme switch and sign-in. A small “Controlled pilot” label is sufficient; don't make a limitation the primary headline.
2. Generous typographic hero paired with one large, legible workflow illustration. Show “Check staging application version,” one illustrative `staging-web-01` target and a clearly labelled **Example — no command is run**. Explain the human purpose before showing command syntax. No stock cloud/server photograph, invented fleet metrics, terminal wall or fabricated customer logo strip.
3. One connected walkthrough: choose an existing task and exact machine → review command and target → explicitly confirm → inspect saved evidence and prepare a handoff. The central illustration may have accessible local step controls; a visitor should learn the sequence through actual visible changes. It must have no launch/API side effects, no simulated live connection badge and no pretend real approval button. Label controls “View review step” or equivalent. The manual example is not an installed operation catalog.
4. A short realistic work scenario: “Someone asks which version is on staging.” Explain task purpose, the machine, the reviewed instruction, and the result the next teammate can inspect. Mention that an owner must supply and validate the actual procedure. The illustrative version file is not a health check.
5. A strong results section with inspectable Success / Failure / Unknown examples and text explanations. Success means the command reported exit 0; failure means a recorded nonzero exit; Unknown means no conclusive result was recorded and the command may have run. Unknown must say check evidence and the server before considering another run. Do not offer a retry interaction. Include the value of a reviewed, sanitized handoff without showing personal data, secrets or unrestricted logs in a sample summary.
6. A compact fit section: for teams with Linux servers, repeatable bounded procedures and an owner who can review the command. Present the current scope plainly: controlled non-production evaluation; installation and customer validation still underway. Explain that Axon works around an existing procedure, not that it replaces every monitoring, incident-management or deployment tool. No superiority, ROI, compliance or production-readiness claims.
7. End with a useful next action: primary “Explore the workflow” anchored to the illustrated workflow; existing-user “Open workspace” or “Sign in” goes to the real `/login` route. No contact form with nowhere to send, fabricated demo booking link, price, free-trial claim or external recipient. An existing registration link may remain secondary only if it truthfully represents the implemented route.

## Visual direction

Build an editorial product page with a memorable sequence, not a collection of interchangeable feature cards. Use oversized but restrained typography, strong reading order, generous whitespace, thin rules, chapter numbers and one coherent product illustration. Keep rounded cards principally for actual product UI. Use asymmetry on desktop and linear narrative on mobile. Avoid decorative glows, gratuitous grids, gradient headline text, icon-per-sentence sections and glass panels.

Dark direction: warm graphite page (`#101214` as a starting point), distinguishable charcoal surfaces, soft near-white primary text, readable cool-gray secondary text and a restrained blue/cyan accent drawn from the actual brand. Avoid a flat pitch-black page, low-contrast gray copy and blue-on-blue primary controls. Primary CTA can be near-white with dark text; semantic status text remains distinct from decoration.

Light direction: warm off-white page, white product surfaces, near-black typography and a deeper blue accent. Theme changes preserve hierarchy, status meaning and control contrast. Values are starting points, not measured acceptance; verify final foreground/background pairs. Shared dashboard token adjustments are allowed to improve dark mode, but don't rewrite layouts, state or execution behavior. Inspect dashboard/auth consumers affected by global tokens in both themes.

Use the existing typography stack and sensible fallbacks. No new remote fonts, image host, tracking or animation dependency. Motion should be short and purposeful; respect reduced motion. A static state must remain completely understandable.

## Brand identity

`frontend/public/axon-logo.png` is the available canonical asset: a cyan/violet circuit motif forming an A, with white/navy structure. It was visually inspected. The active `HomePage.tsx` currently substitutes a Lucide `Command` glyph for the brand; replace that substitution. Use the canonical image in one reusable brand component and the visible shared shell/auth locations within the assigned implementation scope. Keep the asset proportions; do not recolor, replace or redraw its identity. The source includes generous surrounding space and shading: frame it deliberately with a small neutral tile if needed, don't pretend it is a clean vector. Ensure sufficient visible mark size, especially on mobile. With adjacent “Axon” text, the decorative image uses empty alt text and the link has one clear accessible name. Brand use inside illustrative UI must not be confused with a navigation link.

The 1536×1024 source is a full shaded/gray-background composition, not a transparent icon. Do not shrink that entire composition into a tiny navbar square. A CSS-clipped presentation of the actual mark (proportionally scaled image, deliberate position, neutral surrounding frame) is permitted; verify that no meaningful part of the circuit-A is lost. Prefer a legible wordmark plus larger canonical-brand treatment if a faithful small crop cannot work. Inspect the actual mobile result rather than accepting the asset path alone as proof of correct branding.

This contract does not authorize a new logo invention. If a cleaner export is necessary, preserve the canonical source and report that asset limitation separately; don't delay all page work.

## Acceptance and exclusive implementation boundary

Expected implementation files: `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/home-page.css`, scoped shared theme tokens in `frontend/src/index.css`, one brand component and its visible shell/auth consumers, and directly affected frontend tests. Parent assigns exact exclusive paths before work. Backend, Rust, auth flows, execution/approval state machines, routing permissions and saved-evidence authorization logic remain outside this visual slice.

Verify the new local demonstration's step/result controls, theme persistence, actual CTA destinations and keyboard behavior. Cover meaningful changed behavior without snapshots that merely duplicate copy. Run affected tests, then existing frontend lint/build; reuse prior security tests only when their source inputs are unchanged. Save commands, exits, final fingerprints and limitations.

Browser acceptance at 1440, 1024, 768, 390 and 320 CSS-pixel widths in both themes: no horizontal page overflow, clipping, accidental overlap or unreadable miniature product UI. At narrow widths, collapse navigation safely and stack illustration fields; long machine/command text wraps or stays in a locally scrollable, labelled code area. Check 200% zoom, keyboard-only focus and reduced motion. Controls should have at least 44px comfortable targets; maintain visible focus, logical headings, skip link and understandable accessible names. Normal text needs 4.5:1 contrast, large text 3:1 and meaningful control/focus boundaries 3:1. Report measured pairs for buttons, muted text, status labels and focus. Never hide crucial scope or unknown-outcome guidance for mobile.

Record screenshots and review the visual result, not just DOM assertions. Demonstration interaction must make zero execution/approval requests. Check affected dashboard and login appearances for shared-theme/brand regressions. A browser accessibility inspection does not constitute an actual screen-reader or second-operator walkthrough.

## Release sequencing

Next release prerequisite: independently reviewed isolated connected-agent harness, followed by actual success (exit 0), confirmed failure (exit 7), original-identity approval replay and verified owned-resource cleanup. Passing it establishes a bounded local real-agent result only. Actual screen-reader, second operator, live persistence faults, safe hold resolution/retry, clean install, restore and real multi-host gates remain distinct. A retry or reconciliation design requires a separate Astra contract before mutation; do not sneak a retry button into this redesign. Buyer validation requires a real permission-based conversation; it cannot be manufactured by visual polish or public research.
