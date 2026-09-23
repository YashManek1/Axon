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

The pipeline adds six versioned logical roles: research, qualification, use-case selection, drafting, adversarial critique, and verification. These roles may propose work, but deterministic gates control advancement. The current implementation consumes supplied evidence only and stops at `AWAITING_HUMAN_APPROVAL`; its capability flags deny network research, personal-contact resolution, approval, and sending.

Run the synthetic pipeline fixture:

```powershell
python -m axon_outreach.pipeline_cli synthetic-agent-pipeline.json
```

The output is a checksum-addressed, write-once campaign review bundle. Pipeline input schema 2 requires every verified fact to carry a public HTTPS source URL, source type, publication and retrieval times, a verbatim excerpt, and SHA-256 digests of the excerpt and saved source text. The fact text must equal that excerpt; paraphrases belong under inference. A trigger is fresh only when its *publication* date is within 120 days. Every positive qualification component must have a matching verified fact type in the selected use case. The review bundle retains this provenance for inspection.

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

This validates internal consistency, not whether the URL is genuinely first-party, the page was actually retrieved then, or the claim proves budget or intent. The reviewer must open the original public source, check the date and context, and judge the score before approving any recipient batch. SHA-256 makes accidental changes visible; it is not a signature or proof of external truth. Existing version-1 bundles remain verifiable, while new pipeline runs require schema 2.

See `docs/outreach/axon-b2b-agent-contract-v1.md` for the role contracts, authority model, commercial method, and next slices.
