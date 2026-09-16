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
