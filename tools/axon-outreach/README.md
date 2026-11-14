# Axon outreach dry-run adapter

This package turns a manually prepared, reviewed JSON record into a local, checksum-addressed review manifest. It cannot send a message. It has no provider, mailbox, credential, environment-variable, or network integration.

The CLI reads only from `tools/axon-outreach/input/` and writes only to `tools/axon-outreach/output/`. Path traversal is rejected. It never reads the quarantined Desktop outreach repository, its `.env`, its configuration, its workbooks, or its contact data.

## Safety contract

- `profile` is fixed to `axon_b2b` and `mode` is fixed to `dry_run`.
- Every included account must score at least 7/10 under rubric version `2026-09-12`. A zero-recipient batch is valid when it records a non-empty `zero_recipient_reason`; its suppression state is generated as `not_applicable_no_recipients`.
- Organization routes and roles are allowed; person names, email addresses, phone numbers, and personal profile URLs are rejected.
- Suppression must be freshly checked and clear. Batch and item approvals stay `pending` with null approval metadata.
- Unknown jurisdiction or entity type, unresolved placeholders, and forbidden product claims are rejected.
- Every item remains in `dry_run`; capability flags explicitly deny sending, provider access, mailbox access, and credential loading.
- Canonical JSON is SHA-256 hashed. The checksum is embedded and used in the filename. Exclusive file creation prevents an existing manifest from being overwritten.

## Local use

Place a manually reviewed JSON file under `input/`, then run from this directory:

```powershell
python -m axon_outreach.cli reviewed-batch.json
```

The tool prints the new filename under `output/`. There is deliberately no `send`, `approve`, provider, import, or Desktop-migration command.

Run the unit tests:

```powershell
python -m unittest discover -s tests -v
```

The tracked tests use only synthetic organization data. The included zero-recipient input records the current research result without identifying or contacting anyone. A later human gate must authorize any separate contact-resolution or sender implementation.
## Policy-first agent pipeline

The pipeline adds six versioned logical roles: research, qualification, use-case selection, drafting, adversarial critique, and verification. Version 3 consumes supplied evidence only and holds every structurally passing candidate at `AWAITING_EVIDENCE_REVIEW`, with `SUPPLIED_UNVERIFIED` evidence and proposed scores. It emits no recipient or draft, including for strong synthetic evidence. All capability flags remain false; it cannot research the network, resolve contacts, approve, or send.

Run the synthetic pipeline fixture:

```powershell
python -m axon_outreach.pipeline_cli synthetic-agent-pipeline.json
```

The output is a checksum-addressed, write-once evidence-hold bundle. Input schema 2 still requires capture metadata and binds positive score components to supplied fact types in the selected use case. A trigger is fresh only when its *publication* date is within 120 days. Internal candidate drafts undergo the full manifest/privacy/claim/suppression preflight before being discarded; the outward manifest is always empty with pending approval. Inspect the separate source input for provenance: v3 does not retain recipient, draft, or provenance material in its hold bundle.

A researcher can build capture metadata from a manually saved public page without giving the pipeline network access:

```python
from axon_outreach.source_capture import capture_source

capture = capture_source(
    saved_page_text,
    source_url="https://example.invalid/public-page",
    source_type="first_party_site",
    published_at="2026-09-18T08:00:00+05:30",
    retrieved_at="2026-09-19T09:00:00+05:30",
    excerpt="The exact sentence copied from the saved page.",
)
```

This validates internal consistency, not source authenticity, pain, budget, buying intent, or contact permission. There is no reviewer-field or token escape hatch in v3. A later authenticated, evidence-bound review contract is needed before recipient release. SHA-256 is not a review signature or proof of external truth. Existing v1/v2 bundles remain structurally verifiable and are not rewritten; their historical states do not grant qualification, approval, or sending authority. New runs use pipeline version 3 with input schema 2 and manifest schema 1.

See `docs/outreach/axon-b2b-agent-contract-v1.md` for the role contracts, authority model, commercial method, and next slices.

## Unqualified discovery research lane

`axon_outreach.discovery_cli` turns manually supplied, organization-level first-party excerpts into a separate `axon_discovery_review` packet. It is not a qualified manifest, recipient batch, approval, or campaign. This lane exists because a service page can show plausible fit without proving that the seller has its own recurring procedure, measurable pain, inadequate alternative, budget owner, or safe permission to contact. All five remain explicit unknowns. A recent retrieval of an undated service page is allowed as research context, never as a published trigger or urgency signal.

Run from this package directory:

```powershell
python -m axon_outreach.discovery_cli first-client-discovery-2026-09-23.json
```

The input contains three organizations: DailyDeploy, ixmops, and ANTOPS. The source captures are **excerpt-only manual transcriptions** from their public sites: `snapshot_sha256` hashes each supplied excerpt, not a saved full page. The code checks internal consistency, age, first-party domain and prohibited personal data. It does not independently fetch the site or prove the excerpt is current or in context. The packet therefore requires human source review and cannot enter the existing qualified pipeline. Its drafts are discovery questions, not send instructions. All capability flags remain false; there is no contact, approval or provider path.

Before considering any contact, a reviewer must open each linked page and verify the exact wording, reject competitors/exclusions, assess jurisdiction and organization-level routing, then explicitly decide whether a small, separately approved discovery batch is appropriate. No buyer pain or buying intent has been established by these pages. The proposed 7/10 structural threshold remains; passing it does not release recipients or establish qualification.
