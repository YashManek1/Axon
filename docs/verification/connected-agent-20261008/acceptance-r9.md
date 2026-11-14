# Frozen r9 socket-compatibility acceptance

8 October 2026. Independent Astra security review of the bounded harness delta.

## Decision

**GO for ONE fresh isolated full connected-agent harness runtime using the frozen r9 source.** No required repair was found against `socket-compatibility-decision.md`. This is permission to gather runtime evidence, not acceptance of a successful runtime, product deployment, or a pilot.

## Evidence and review

- Read the complete compatibility decision and `compatibility-r9.md`. Independently calculated SHA-256 for every one of the packet's ten harness files: **10/10 match**. The freeze therefore includes the three reviewed changed files and the seven unchanged files. The packet remains the exact fingerprint inventory.
- Reviewed `approval-connected-agent-lib.mjs`, production wiring in `approval-connected-agent-orchestrator.mjs`, and the changed shared-path coverage in `approval-connected-agent.guard.test.mjs`. No Docker command or duplicate test suite was executed by this reviewer.
- Reused the frozen packet's native-exit-0 evidence: **112 tests passed, zero failures/cancellations/skips/todos**, plus **eight syntax checks, all exit 0**. These tests exercise the production helper, topology gate and lifecycle/report path, not a detached diagnostic serializer alone.
- Reused r8's failed-before-verifier runtime and parent-confirmed independent absence of all twelve owned resources. That proves the prior attempt closed safely; it is not evidence that r9 execution has succeeded.

### Contract findings

1. `launchOwnedAgent` constructs a fixed, frozen argument array, extracts the allowlisted intent from that same array, awaits intent persistence, and sends that array to the injected Docker adapter. The socket request remains exactly `/var/run/docker.sock:/var/run/docker.sock`. Additional plan keys/source overrides are rejected. The production caller records the attempted container before invoking this helper, records its inspected immutable ID after creation, and passes that exact attempt ID to validation. Tests capture the actual adapter arguments and cover launch/persistence failures.
2. Validation preserves owner/run/name/immutable-ID checks and the existing privilege, single-network and no-port barriers. Trusted diagnostic capture follows those identity/topology checks. Missing or mismatched launch intent cannot reach daemon exec. Exact journal identity/type/destination and exactly two corresponding mounts and observed Binds are required, independently of ordering.
3. The only added source representation is the exact `/run/host-services/docker.proxy.sock`, at the exact bind destination `/var/run/docker.sock`. Its branch additionally requires exact `desktop-linux`, exact `npipe:////./pipe/dockerDesktopLinuxEngine`, Linux OS and a nonempty preflight daemon ID matching the expected ID. Production independently checks that selected context/endpoint before creating Docker resources. No observed-source learning, path normalization, remote endpoint or broad allowlist was added.
4. Accepted mount representation still precedes a Docker daemon-ID query using the immutable agent ID; only an exact daemon match permits verification. Tests cover the proxy success path, wrong/missing metadata and intent, endpoint/path lookalikes, mismatched/extra/missing Binds or mounts, wrong journal, identity/topology failures, and different-daemon rejection with forbidden downstream calls absent.
5. `observedBinds` is now named truthfully. New intent/preflight strings use the same known-secret redaction before bounding, structural malformed/clipped flags and final recursive redaction. Tests inject secrets into the newly permitted dynamic fields. Failure diagnostics survive the shared cleanup/persist/nonzero path; observing a proxy representation does not itself claim same-daemon verification.
6. The production cleanup call sequence and authority remain unchanged: reconcile only declared attempts, quiesce/inventory nested resources, and delete only exact owned resources through the existing adapters. Runner validation/copy/exec, fixture/verifier and resource boundaries are not expanded. Their unchanged evidence is reused, not replaced by the new mocked lifecycle assertions.

## Limits and next acceptance gate

Docker socket access retains substantial local daemon authority. Exact local metadata is a compatibility restriction, not authentication against a compromised administrator, Docker CLI or daemon. Unrecognized Desktop representations/endpoints must stop; this review does not authorize adding another variant during the runtime. Existing guard semantics outside this delta are not newly hardened or re-certified here.

Run only the one fresh isolated harness authorized above. Runtime acceptance still requires real success and exit-7 failure, persisted approval/target/attempt correlation, replay and saved GET evidence, native exit 0, successful nested cleanup and independent absence of all twelve owned resources. A failed or incomplete attempt must be reported as such and reviewed before any new run or guard change.

Rejected alternatives remain automatic learning from inspected mounts, global proxy acceptance, treating rewritten Binds as CLI-intent proof, removing same-daemon validation, or expanding cleanup scope. No such alternative is needed for this frozen slice.

Reviewer wrote only this acceptance record; implementation and unrelated edits remain with their owners.
