# Workflow depth check — 27 September 2026

Status: DISCOVERY_REVIEW_ONLY. Follow-up on three already-counted organizations, not three new leads. This does not establish pain, buyer/budget, contact permission, qualification, drafts or sends. Public pages were retrieved on 27 September; publication dates are unknown. Provider descriptions are claims, not independent operational verification.

## PrecisionTech: inherited-server baseline and engineer handoff

Their [Linux service FAQ](https://precisiontech.in/services/managed-services/linux/) describes an initial health review covering package/service state, access, networking, certificates, backups and monitoring, followed by prioritized remediation. It also names Ansible playbooks, CI integration, incident runbooks and smoke tests. Locators: “How do you onboard existing servers?” and “Do you handle automation and configuration management?”

Potential insertion point is narrowly before a receiving engineer accepts a non-production host: an approved, read-only baseline check whose target and result are reviewable. This is a hypothesis, not a missing feature observed in their operation. Existing Ansible/CI may already cover the entire step.

Discovery question: which checks, if any, still require repeated manual work outside those playbooks? Request a sanitized procedure and its existing evidence format only after a permitted conversation. Do not request keys, user inventories, customer logs or production access. Reject if no recurring gap is demonstrated.

## AV Services: backup reporting already has a named workflow

The [backup/recovery page](https://avservices.in/backups-recovery/) describes rsync/borgbackup, temporary-location restore checks, Nagios alerts, Observium capacity tracking and monthly results filed through Dolibarr. Locators: “The backup stack” and “Reporting”. This is stronger alternative-tool evidence than the broad service listing.

The default inference is overlap, not an Axon opportunity: restore verification and evidence reporting are already described. Do not pitch backup orchestration, restore automation or a replacement dashboard. A remaining hypothesis is limited to a non-production, read-only pre-maintenance check outside this stack. Ask whether such a gap actually exists; reject if their current process covers it. Provider incident stories establish neither buying intent nor permission to approach its clients.

## SysRoot: public process, but no proved internal gap

The [official page](https://sysroot.io/) describes an assessment-to-documentation-to-managed-operations sequence, including runbooks, ownership boundaries and ongoing maintenance. Locator: “How we work with growing engineering teams”. No internal procedure, measured overhead or purchase requirement was established by this retrieval.

Potential insertion point is a non-production support-shift verification result, only if engineers currently reconstruct that evidence. Ask for one repeated check, how the receiving operator reviews its target/result, and what their existing tooling misses. Reject if documentation or current automation already solves it.

## What would make personalization defensible

For each organization retain: exact public workflow reference; one explicitly labeled gap hypothesis; current alternatives; one falsifying question; and unsupported claims to avoid. Only after first-hand validation add measured frequency/cost, authorized safe procedure, buyer/budget signal and contact basis. Do not translate a provider's customer-facing problem statement into that provider's own pain.

Research priority is not qualification. This deeper pass makes AV Services less compelling unless a separate gap is shown; PrecisionTech's Ansible overlap is an explicit hurdle, and SysRoot lacks procedure-level evidence. More generic company names would not resolve those uncertainties.
