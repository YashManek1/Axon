"""Deterministic, local-only Axon outreach review pipeline.

The named agents are bounded roles. They never gain transport, network, mailbox,
credential, scheduling, approval, or send capabilities. Deterministic code makes
structural decisions and holds every passing candidate for independent evidence review.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from .manifest import ManifestError, SCORE_FACT_TYPES, build_manifest, verify_manifest
from .source_capture import validate_capture
from .validation import ValidationError, exact_mapping, public_https_url, safe_text, timestamp


PIPELINE_VERSION = 3
EVIDENCE_HOLD_REASON = (
    "No qualified recipients; structurally passing candidates require independent evidence review."
)
MAX_CLOCK_SKEW = timedelta(minutes=5)
MAX_TRIGGER_AGE = timedelta(days=120)
MAX_PLANNING_HORIZON = timedelta(days=30)
CAPABILITY_LEDGER_VERSION = "2026-09-20"
CAPABILITY_ID = "assessment_evidence_v1"
CAPABILITY_CLAIM = (
    "Axon maps one approved non-production procedure to an exact target and "
    "returns a reviewable evidence bundle."
)
CAPABILITIES = {
    "can_research_network": False,
    "can_resolve_personal_contacts": False,
    "can_access_mailbox": False,
    "can_access_provider": False,
    "can_load_credentials": False,
    "can_schedule": False,
    "can_approve": False,
    "can_send": False,
}
APPROVAL = {
    "status": "pending",
    "approved_by": None,
    "approved_at": None,
    "approval_expires_at": None,
}
ACCOUNT_KEYS = {
    "account_id", "organization", "domain", "observed_at", "jurisdiction",
    "entity_type", "channel", "recipient_route", "planned_at", "message_version",
    "evidence", "score", "candidate_use_cases", "suppression",
}
EVIDENCE_KEYS = {
    "evidence_id", "kind", "text", "source_url", "observed_at", "is_trigger",
    "source_capture", "fact_type",
}
USE_CASE_KEYS = {
    "use_case_id", "title", "problem_hypothesis", "owner_roles",
    "supporting_evidence_ids", "fit_score", "capability_id",
}
SCORE_KEYS = {
    "repeated_procedure", "cost_or_failure_pain", "buyer_access_or_budget",
    "current_alternative_gap", "safe_assessment_path",
}

OTHER_FACT_TYPES = {"dated_trigger", "service_offering"}


class PipelineError(ValueError):
    """A safe, account-scoped rejection from the review pipeline."""

    def __init__(self, reason_code: str, message: str):
        super().__init__(message)
        self.reason_code = reason_code


@dataclass(frozen=True)
class AgentSpec:
    name: str
    role: str
    backstory: str
    purpose: str
    goal: str
    task: str
    input_contract: str
    output_contract: str
    constraints: tuple[str, ...]
    acceptance_checks: tuple[str, ...]


def _spec(name: str, role: str, purpose: str, task: str, output: str) -> AgentSpec:
    return AgentSpec(
        name=name,
        role=role,
        backstory=f"Senior {role} working inside Axon's review-only outreach boundary.",
        purpose=purpose,
        goal="Produce one auditable input for the next stage or reject the account.",
        task=task,
        input_contract="Validated local JSON only; exact schemas; no implicit enrichment.",
        output_contract=output,
        constraints=(
            "No network, mailbox, contact resolution, credentials, scheduling, approval, or sending.",
            "Never invent a fact, person, product capability, or evidence source.",
            "Deterministic policy code has final authority.",
        ),
        acceptance_checks=(
            "Every assertion maps to supplied evidence or an explicit inference.",
            "The output passes exact-schema, freshness, suppression, and capability checks.",
            "Failure is represented by a stable reason code.",
        ),
    )


LEGACY_AGENT_SPECS = {
    "research": _spec(
        "research", "B2B research analyst",
        "Separate supplied public facts from explicit hypotheses.",
        "Validate organization evidence, timestamps, and sources.",
        "A normalized evidence set with a fresh trigger.",
    ),
    "qualification": _spec(
        "qualification", "commercial qualification analyst",
        "Spend review time only on accounts with a concrete safe assessment path.",
        "Verify the five-part qualification rubric and total.",
        "A validated score of at least 7/10.",
    ),
    "use_case": _spec(
        "use_case", "solution consultant",
        "Select a narrow use case Axon can truthfully support.",
        "Match evidence, owner role, and the capability ledger.",
        "One supported use case with a fit score.",
    ),
    "draft": _spec(
        "draft", "enterprise copywriter",
        "Turn verified evidence into concise, honest organization-level copy.",
        "Draft one review-only message without personal data or inflated claims.",
        "A subject and body grounded in the selected use case.",
    ),
    "critic": _spec(
        "critic", "outreach quality reviewer",
        "Reject vague, long, manipulative, or unsupported messages.",
        "Score clarity, evidence, relevance, brevity, CTA, and opt-out language.",
        "A deterministic message-quality score and findings.",
    ),
    "verification": _spec(
        "verification", "campaign release controller",
        "Assemble an immutable review artifact while preserving human authority.",
        "Bind claims to sources and build the dry-run manifest item.",
        "A validated item that can only await human approval.",
    ),
}


AGENT_SPECS = {
    "research": _spec("research", "B2B research analyst",
        "Check internal consistency of supplied, externally unverified evidence.",
        "Validate supplied capture bindings and publication freshness, not source authenticity.",
        "Structurally checked supplied evidence; external truth remains unverified."),
    "qualification": _spec("qualification", "commercial qualification analyst",
        "Check a proposed rubric without asserting buyer truth or purchase intent.",
        "Recompute caller-proposed scores and check supplied fact-type bindings.",
        "A structurally passing proposed score, not validated commercial confidence."),
    "use_case": _spec("use_case", "solution consultant",
        "Check a supplied use-case proposal against the capability ledger.",
        "Check role, support identifiers and proposed fit; do not establish permission.",
        "A structurally selected proposal whose fit remains unverified."),
    "draft": _spec("draft", "enterprise copywriter",
        "Exercise draft safety checks without releasing a draft.",
        "Construct an ephemeral candidate for privacy and claim preflight only.",
        "An internal candidate discarded before bundle publication."),
    "critic": _spec("critic", "outreach quality reviewer",
        "Check deterministic message constraints, not semantic evidence truth.",
        "Check the ephemeral candidate's length, capability, CTA and opt-out constraints.",
        "Internal safety findings, not authenticated evidence review."),
    "verification": _spec("verification", "campaign release controller",
        "Block release until independent evidence review has a separate trusted contract.",
        "Run full manifest safety preflight then discard recipients and drafts.",
        "An AWAITING_EVIDENCE_REVIEW hold and an empty pending manifest."),
}


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _text(value: Any, label: str, *, multiline: bool = False) -> str:
    try:
        return safe_text(value, label, multiline=multiline)
    except ValidationError as exc:
        raise PipelineError("MANIFEST_REJECTED", str(exc)) from exc


def _time(value: Any, label: str) -> datetime:
    try:
        return timestamp(value, label)[1]
    except ValidationError as exc:
        raise PipelineError("MANIFEST_REJECTED", str(exc)) from exc


def _exact(value: Any, required: set[str], label: str, optional: set[str] | None = None) -> dict[str, Any]:
    try:
        return exact_mapping(value, label, required | set(optional or ()), optional=set(optional or ()))
    except ValidationError as exc:
        raise PipelineError("MANIFEST_REJECTED", str(exc)) from exc


def _public_url(value: Any, label: str) -> str:
    try:
        return public_https_url(value, label)
    except ValidationError as exc:
        raise PipelineError("MANIFEST_REJECTED", str(exc)) from exc


class ResearchAgent:
    def __init__(self, now: datetime):
        self.now = now

    def run(self, account: Mapping[str, Any], prepared_at: datetime) -> dict[str, Any]:
        item = _exact(account, ACCOUNT_KEYS, "account")
        for key in (
            "account_id", "organization", "domain", "jurisdiction", "entity_type",
            "channel", "message_version",
        ):
            item[key] = _text(item[key], f"account.{key}")
        item["observed_at"] = _text(item["observed_at"], "account.observed_at")
        item["planned_at"] = _text(item["planned_at"], "account.planned_at")
        observed = _time(item["observed_at"], "account.observed_at")
        planned = _time(item["planned_at"], "account.planned_at")
        if observed > self.now + MAX_CLOCK_SKEW or planned > prepared_at + MAX_PLANNING_HORIZON:
            raise PipelineError("MANIFEST_REJECTED", "account timestamps exceed trusted bounds")
        if planned <= prepared_at:
            raise PipelineError("MANIFEST_REJECTED", "planned_at must be after prepared_at")
        if item["jurisdiction"].lower() == "unknown" or item["entity_type"].lower() == "unknown":
            raise PipelineError("MANIFEST_REJECTED", "jurisdiction and entity_type must be known")
        if item["channel"] not in {"business_email", "organization_contact_form"}:
            raise PipelineError("MANIFEST_REJECTED", "unsupported organization-level channel")

        route = _exact(item["recipient_route"], {"route_type", "role"}, "account.recipient_route")
        route["route_type"] = _text(route["route_type"], "account.recipient_route.route_type")
        route["role"] = _text(route["role"], "account.recipient_route.role")
        item["recipient_route"] = route

        raw_evidence = item["evidence"]
        if not isinstance(raw_evidence, list) or not raw_evidence:
            raise PipelineError("MANIFEST_REJECTED", "account.evidence must be a non-empty list")
        evidence: list[dict[str, Any]] = []
        seen: set[str] = set()
        fresh_trigger = False
        for index, raw in enumerate(raw_evidence):
            entry = _exact(
                raw, EVIDENCE_KEYS, f"account.evidence[{index}]",
                optional={"contradicts_evidence_ids"},
            )
            contradictions = entry.pop("contradicts_evidence_ids", [])
            if contradictions:
                raise PipelineError("MANIFEST_REJECTED", "contradictory evidence requires human resolution")
            entry["evidence_id"] = _text(entry["evidence_id"], f"account.evidence[{index}].evidence_id")
            if entry["evidence_id"] in seen:
                raise PipelineError("MANIFEST_REJECTED", "evidence_id values must be unique")
            seen.add(entry["evidence_id"])
            if entry["kind"] not in {"verified_fact", "inference"}:
                raise PipelineError("MANIFEST_REJECTED", "evidence kind is invalid")
            entry["text"] = _text(entry["text"], f"account.evidence[{index}].text")
            entry["source_url"] = _public_url(entry["source_url"], f"account.evidence[{index}].source_url")
            evidence_time = _time(entry["observed_at"], f"account.evidence[{index}].observed_at")
            if evidence_time > self.now + MAX_CLOCK_SKEW or evidence_time > prepared_at + MAX_CLOCK_SKEW:
                raise PipelineError("MANIFEST_REJECTED", "future evidence is not allowed")
            if type(entry["is_trigger"]) is not bool:
                raise PipelineError("MANIFEST_REJECTED", "is_trigger must be boolean")
            if entry["kind"] == "verified_fact":
                try:
                    capture = validate_capture(entry["source_capture"], f"account.evidence[{index}].source_capture")
                except ValidationError as exc:
                    raise PipelineError("SOURCE_CAPTURE_REJECTED", str(exc)) from exc
                if capture["source_url"] != entry["source_url"]:
                    raise PipelineError("SOURCE_CAPTURE_REJECTED", "capture URL must match evidence URL")
                if capture["excerpt"] != entry["text"]:
                    raise PipelineError("SOURCE_CAPTURE_REJECTED", "verified fact must match the captured excerpt")
                if entry["fact_type"] not in set(SCORE_FACT_TYPES.values()) | OTHER_FACT_TYPES:
                    raise PipelineError("MANIFEST_REJECTED", "verified fact_type is unsupported")
                if _time(capture["retrieved_at"], "capture.retrieved_at") != evidence_time:
                    raise PipelineError("SOURCE_CAPTURE_REJECTED", "evidence observed_at must equal source retrieval time")
                entry["source_capture"] = capture
            elif entry["source_capture"] is not None or entry["fact_type"] is not None:
                raise PipelineError("SOURCE_CAPTURE_REJECTED", "inferences cannot carry verified source attributes")
            if entry["is_trigger"] and entry["kind"] == "verified_fact":
                published_at = entry["source_capture"]["published_at"]
                age = prepared_at - _time(published_at, "capture.published_at") if published_at else None
                if age is not None and timedelta(0) <= age <= MAX_TRIGGER_AGE:
                    fresh_trigger = True
            evidence.append(entry)
        if not any(x["kind"] == "verified_fact" for x in evidence):
            raise PipelineError("MANIFEST_REJECTED", "at least one verified fact is required")
        if not fresh_trigger:
            raise PipelineError("STALE_RESEARCH", "no verified, published trigger is within 120 days")
        item["evidence"] = evidence
        return item


class QualificationAgent:
    def run(self, account: Mapping[str, Any]) -> dict[str, Any]:
        score = _exact(account["score"], {"rubric_version", "components", "total"}, "account.score")
        components = _exact(score["components"], SCORE_KEYS, "account.score.components")
        if score["rubric_version"] != "2026-09-12":
            raise PipelineError("MANIFEST_REJECTED", "unsupported score rubric")
        if any(type(value) is not int or value < 0 or value > 2 for value in components.values()):
            raise PipelineError("MANIFEST_REJECTED", "score components must be integers from 0 to 2")
        if type(score["total"]) is not int or score["total"] != sum(components.values()):
            raise PipelineError("MANIFEST_REJECTED", "score total must equal component sum")
        verified_types = {entry["fact_type"] for entry in account["evidence"] if entry["kind"] == "verified_fact"}
        unsupported_high = [name for name, value in components.items() if value > 0 and SCORE_FACT_TYPES[name] not in verified_types]
        if unsupported_high:
            raise PipelineError("UNSUPPORTED_SCORE", f"positive score requires matching verified evidence: {unsupported_high}")
        if score["total"] < 7:
            raise PipelineError("BELOW_QUALIFICATION_THRESHOLD", "score is below 7/10")
        score["components"] = components
        return score


class UseCaseAgent:
    def run(self, account: Mapping[str, Any]) -> dict[str, Any]:
        candidates = account["candidate_use_cases"]
        if not isinstance(candidates, list) or not candidates:
            raise PipelineError("MANIFEST_REJECTED", "candidate_use_cases must be a non-empty list")
        evidence_ids = {entry["evidence_id"] for entry in account["evidence"]}
        verified_ids = {
            entry["evidence_id"] for entry in account["evidence"]
            if entry["kind"] == "verified_fact"
        }
        role = account["recipient_route"]["role"].casefold()
        valid: list[dict[str, Any]] = []
        unsupported = False
        for index, raw in enumerate(candidates):
            candidate = _exact(
                raw, USE_CASE_KEYS, f"account.candidate_use_cases[{index}]",
                optional={"contradicts_evidence_ids"},
            )
            if candidate.pop("contradicts_evidence_ids", []):
                continue
            for key in ("use_case_id", "title", "problem_hypothesis", "capability_id"):
                candidate[key] = _text(candidate[key], f"candidate_use_cases[{index}].{key}")
            if candidate["capability_id"] != CAPABILITY_ID:
                unsupported = True
                continue
            owners = candidate["owner_roles"]
            support = candidate["supporting_evidence_ids"]
            if not isinstance(owners, list) or not owners or not all(isinstance(x, str) for x in owners):
                raise PipelineError("MANIFEST_REJECTED", "owner_roles must be a non-empty text list")
            if role not in {_text(x, "owner_role").casefold() for x in owners}:
                continue
            if not isinstance(support, list) or not support or not all(isinstance(x, str) for x in support):
                raise PipelineError("MANIFEST_REJECTED", "supporting_evidence_ids must be a non-empty text list")
            if not set(support) <= evidence_ids or not set(support).intersection(verified_ids):
                continue
            if type(candidate["fit_score"]) is not int or not 0 <= candidate["fit_score"] <= 10:
                raise PipelineError("MANIFEST_REJECTED", "fit_score must be an integer from 0 to 10")
            if candidate["fit_score"] >= 7:
                valid.append(candidate)
        if valid:
            return sorted(valid, key=lambda value: (-value["fit_score"], value["use_case_id"]))[0]
        if unsupported:
            raise PipelineError("UNSUPPORTED_PRODUCT_CLAIM", "use case is outside the capability ledger")
        raise PipelineError("ROLE_MISMATCH", "no supported use case matches the organization role")


class DraftAgent:
    def run(self, account: Mapping[str, Any], use_case: Mapping[str, Any]) -> dict[str, str]:
        fact = next(
            entry["text"] for entry in account["evidence"]
            if entry["kind"] == "verified_fact"
            and entry["evidence_id"] in use_case["supporting_evidence_ids"]
        )
        return {
            "subject": f"{account['organization']}: review one recurring procedure",
            "body": (
                f"I saw that {fact}.\n\n"
                f"That may create {use_case['problem_hypothesis']}.\n\n"
                f"{CAPABILITY_CLAIM}\n\n"
                "Would a 20-minute fit check be useful?\n\n"
                "If this is not relevant, tell me and I will not follow up."
            ),
        }


class CriticAgent:
    def run(
        self, account: Mapping[str, Any], use_case: Mapping[str, Any], draft: Mapping[str, str]
    ) -> dict[str, Any]:
        body = draft["body"]
        checks = {
            "subject_length": len(draft["subject"]) <= 70,
            "body_length": len(body.split()) <= 100,
            "single_question": body.count("?") == 1,
            "capability_exact": body.count(CAPABILITY_CLAIM) == 1,
            "opt_out": "I will not follow up" in body,
        }
        return {
            "score": sum(2 for passed in checks.values() if passed),
            "checks": checks,
            "findings": [name for name, passed in checks.items() if not passed],
        }


class VerificationAgent:
    def run(
        self,
        account: Mapping[str, Any],
        score: Mapping[str, Any],
        use_case: Mapping[str, Any],
        draft: Mapping[str, str],
        critique: Mapping[str, Any],
    ) -> dict[str, Any]:
        if critique["score"] != 10:
            raise PipelineError("MESSAGE_QUALITY_REJECTED", "draft failed quality review")
        evidence_by_id = {entry["evidence_id"]: entry for entry in account["evidence"]}
        selected = [evidence_by_id[key] for key in use_case["supporting_evidence_ids"]]
        selected_types = {entry["fact_type"] for entry in selected if entry["kind"] == "verified_fact"}
        if any(SCORE_FACT_TYPES[name] not in selected_types for name, value in score["components"].items() if value > 0):
            raise PipelineError("UNSUPPORTED_SCORE", "scored facts must support the selected use case")
        sources = list(dict.fromkeys(entry["source_url"] for entry in selected))
        return {
            "account_id": account["account_id"],
            "organization": account["organization"],
            "domain": account["domain"],
            "observed_at": account["observed_at"],
            "jurisdiction": account["jurisdiction"],
            "entity_type": account["entity_type"],
            "channel": account["channel"],
            "planned_at": account["planned_at"],
            "message_version": account["message_version"],
            "recipient_route": account["recipient_route"],
            "source_urls": sources,
            "research_provenance": [
                {
                    "evidence_id": x["evidence_id"],
                    "source_url": x["source_url"],
                    "fact_type": x["fact_type"],
                    "fact_text": x["text"],
                    "source_capture": copy.deepcopy(x["source_capture"]),
                }
                for x in selected if x["kind"] == "verified_fact"
            ],
            "verified_facts": [x["text"] for x in selected if x["kind"] == "verified_fact"],
            "inferences": [x["text"] for x in selected if x["kind"] == "inference"],
            "score": copy.deepcopy(score),
            "suppression": copy.deepcopy(account["suppression"]),
            "approval": copy.deepcopy(APPROVAL),
            "draft": copy.deepcopy(draft),
            "claim_ledger": [
                {"kind": x["kind"], "text": x["text"], "source_url": x["source_url"]}
                for x in selected
            ],
            "selected_use_case": copy.deepcopy(use_case),
            "capability_claims": [CAPABILITY_CLAIM],
            "message_quality": copy.deepcopy(critique),
            "pipeline_state": "AWAITING_HUMAN_APPROVAL",
            "pipeline_stages": list(AGENT_SPECS),
        }


class OutreachPipeline:
    def __init__(self, clock: Callable[[], datetime] | None = None):
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def run(self, source: Mapping[str, Any]) -> dict[str, Any]:
        now = self.clock()
        if now.tzinfo is None:
            raise PipelineError("MANIFEST_REJECTED", "trusted clock must include a timezone")
        data = _exact(
            source,
            {"schema_version", "profile", "mode", "batch_id", "prepared_at", "accounts"},
            "source",
        )
        prepared = _time(data["prepared_at"], "source.prepared_at")
        if prepared > now + MAX_CLOCK_SKEW:
            raise PipelineError("MANIFEST_REJECTED", "prepared_at is in the future")
        if data["schema_version"] != 2 or data["profile"] != "axon_b2b" or data["mode"] != "dry_run":
            raise PipelineError("MANIFEST_REJECTED", "pipeline is locked to axon_b2b dry_run schema 2")
        if not isinstance(data["accounts"], list):
            raise PipelineError("MANIFEST_REJECTED", "source.accounts must be a list")

        decisions: list[dict[str, Any]] = []
        items: list[dict[str, Any]] = []
        research = ResearchAgent(now)
        qualification = QualificationAgent()
        use_cases = UseCaseAgent()
        drafting = DraftAgent()
        critic = CriticAgent()
        verification = VerificationAgent()

        for raw in data["accounts"]:
            account_id = raw.get("account_id", "unknown") if isinstance(raw, Mapping) else "unknown"
            try:
                account = research.run(raw, prepared)
                suppression = _exact(
                    account["suppression"],
                    {"checked", "status", "checked_at", "reason"},
                    "account.suppression",
                )
                checked_at = _time(suppression["checked_at"], "account.suppression.checked_at")
                if checked_at > now + MAX_CLOCK_SKEW or checked_at > prepared + MAX_CLOCK_SKEW:
                    raise PipelineError("MANIFEST_REJECTED", "suppression check is in the future")
                if suppression["checked"] is not True:
                    raise PipelineError("MANIFEST_REJECTED", "suppression must be checked")
                if suppression["status"] != "clear":
                    decisions.append({
                        "account_id": account["account_id"],
                        "state": "SUPPRESSED",
                        "reason_code": "SUPPRESSED",
                    })
                    continue
                if suppression["reason"] is not None:
                    raise PipelineError("MANIFEST_REJECTED", "clear suppression cannot have a reason")
                account["suppression"] = suppression
                score = qualification.run(account)
                selected = use_cases.run(account)
                draft = drafting.run(account, selected)
                critique = critic.run(account, selected, draft)
                item = verification.run(account, score, selected, draft, critique)
                items.append(item)  # Ephemeral: full safety preflight still runs below.
                decisions.append({
                    "account_id": account["account_id"],
                    "state": "AWAITING_EVIDENCE_REVIEW",
                    "reason_code": "SEMANTIC_REVIEW_REQUIRED",
                    "use_case_id": selected["use_case_id"],
                    "proposed_score": copy.deepcopy(score),
                    "proposed_use_case_fit": selected["fit_score"],
                    "evidence_status": "SUPPLIED_UNVERIFIED",
                })
            except PipelineError as exc:
                decisions.append({
                    "account_id": account_id,
                    "state": "REJECTED",
                    "reason_code": exc.reason_code,
                })

        manifest_source: dict[str, Any] = {
            "schema_version": 1,
            "profile": "axon_b2b",
            "mode": "dry_run",
            "batch_id": data["batch_id"],
            "prepared_at": data["prepared_at"],
            "approval": copy.deepcopy(APPROVAL),
            "items": items,
        }
        if not items:
            manifest_source["zero_recipient_reason"] = (
                "No account passed deterministic qualification and safety checks."
            )
        try:
            # Preserve whole-batch safety failure semantics. Never publish this candidate.
            build_manifest(manifest_source)
            manifest_source["items"] = []
            manifest_source["zero_recipient_reason"] = EVIDENCE_HOLD_REASON
            manifest = build_manifest(manifest_source)
        except ManifestError as exc:
            raise PipelineError("MANIFEST_REJECTED", str(exc)) from exc

        bundle: dict[str, Any] = {
            "pipeline_version": PIPELINE_VERSION,
            "profile": "axon_b2b",
            "mode": "dry_run",
            "batch_id": data["batch_id"],
            "prepared_at": data["prepared_at"],
            "agents": list(AGENT_SPECS),
            "agent_contracts": [json.loads(json.dumps(asdict(spec))) for spec in AGENT_SPECS.values()],
            "capability_ledger_version": CAPABILITY_LEDGER_VERSION,
            "capabilities": copy.deepcopy(CAPABILITIES),
            "decisions": decisions,
            "manifest": manifest,
        }
        bundle["bundle_sha256"] = _sha256(bundle)
        return bundle


def build_campaign_bundle(
    source: Mapping[str, Any], *, now: datetime | None = None
) -> dict[str, Any]:
    if now is None:
        prepared = timestamp(source.get("prepared_at"), "source.prepared_at")[1]
        now = prepared
    return OutreachPipeline(clock=lambda: now).run(source)


def _valid_hold_decision(decision: Any) -> bool:
    if not isinstance(decision, Mapping):
        return False
    _text(decision.get("account_id"), "decision.account_id")
    state = decision.get("state")
    if state in {"REJECTED", "SUPPRESSED"}:
        if set(decision) != {"account_id", "state", "reason_code"}:
            return False
        reason = _text(decision["reason_code"], "decision.reason_code")
        return (reason == "SUPPRESSED" if state == "SUPPRESSED" else
                reason not in {"QUALIFIED_REVIEW_ONLY", "SEMANTIC_REVIEW_REQUIRED", "SUPPRESSED"})
    if set(decision) != {"account_id", "state", "reason_code", "use_case_id",
                         "proposed_score", "proposed_use_case_fit", "evidence_status"}:
        return False
    if (state != "AWAITING_EVIDENCE_REVIEW"
            or decision["reason_code"] != "SEMANTIC_REVIEW_REQUIRED"
            or decision["evidence_status"] != "SUPPLIED_UNVERIFIED"):
        return False
    _text(decision["use_case_id"], "decision.use_case_id")
    fit = decision["proposed_use_case_fit"]
    score = _exact(decision["proposed_score"], {"rubric_version", "components", "total"}, "proposed_score")
    components = _exact(score["components"], SCORE_KEYS, "proposed_score.components")
    return (type(fit) is int and 7 <= fit <= 10
            and score["rubric_version"] == "2026-09-12"
            and all(type(value) is int and 0 <= value <= 2 for value in components.values())
            and type(score["total"]) is int and 7 <= score["total"] <= 10
            and score["total"] == sum(components.values()))


def verify_bundle(bundle: Mapping[str, Any]) -> bool:
    """Verify structural integrity, never source authenticity or human approval."""
    try:
        candidate = copy.deepcopy(dict(bundle))
        recorded = candidate.pop("bundle_sha256", None)
        if not isinstance(recorded, str) or recorded != _sha256(candidate):
            return False
        if set(candidate) != {
            "pipeline_version", "profile", "mode", "batch_id", "prepared_at",
            "agents", "agent_contracts", "capability_ledger_version",
            "capabilities", "decisions", "manifest",
        }:
            return False
        version = candidate["pipeline_version"]
        if type(version) is not int or version not in {1, 2, 3}:
            return False
        if version == 2 and any(
            "research_provenance" not in item for item in candidate["manifest"]["items"]
        ):
            return False
        specs = AGENT_SPECS if version == 3 else LEGACY_AGENT_SPECS
        if candidate["agents"] != list(specs):
            return False
        if candidate["agent_contracts"] != [json.loads(json.dumps(asdict(spec))) for spec in specs.values()]:
            return False
        if candidate["capability_ledger_version"] != CAPABILITY_LEDGER_VERSION:
            return False
        if candidate["capabilities"] != CAPABILITIES:
            return False
        if not verify_manifest(candidate["manifest"]):
            return False
        if version == 3:
            manifest = candidate["manifest"]
            if (candidate["profile"] != "axon_b2b" or candidate["mode"] != "dry_run"
                    or any(value is not False for value in candidate["capabilities"].values())
                    or any(value is not False for value in manifest["capabilities"].values())
                    or any(candidate[key] != manifest[key] for key in
                           ("profile", "mode", "batch_id", "prepared_at"))
                    or manifest["items"] != []
                    or manifest["approval"] != APPROVAL
                    or manifest["zero_recipient_reason"] != EVIDENCE_HOLD_REASON):
                return False
            return (isinstance(candidate["decisions"], list)
                    and all(_valid_hold_decision(decision) for decision in candidate["decisions"]))
        approved_ids = {
            item["account_id"] for item in candidate["manifest"]["items"]
        }
        decision_ids = {
            decision["account_id"] for decision in candidate["decisions"]
            if decision.get("state") == "AWAITING_HUMAN_APPROVAL"
        }
        return approved_ids == decision_ids
    except (KeyError, TypeError, ValueError):
        return False


def write_bundle(bundle: Mapping[str, Any], output_dir: Path) -> Path:
    if not verify_bundle(bundle):
        raise PipelineError("MANIFEST_REJECTED", "bundle checksum or semantics are invalid")
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{bundle['batch_id']}.{bundle['bundle_sha256']}.pipeline.json"
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(bundle, handle, ensure_ascii=False, sort_keys=True, indent=2)
        handle.write("\n")
    return target
