"""Build immutable outreach review manifests without any send capability."""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import re
from pathlib import Path
from typing import Any, Mapping

from .validation import ValidationError, exact_mapping, public_https_url, safe_text, timestamp
from .source_capture import validate_capture

PROFILE = "axon_b2b"
MODE = "dry_run"
SCHEMA_VERSION = 1
QUALIFICATION_THRESHOLD = 7
SCORE_KEYS = {"repeated_procedure", "cost_or_failure_pain", "buyer_access_or_budget", "current_alternative_gap", "safe_assessment_path"}
SCORE_FACT_TYPES = {
    "repeated_procedure": "repeated_procedure",
    "cost_or_failure_pain": "observed_pain",
    "buyer_access_or_budget": "buyer_or_budget",
    "current_alternative_gap": "alternative_gap",
    "safe_assessment_path": "safe_assessment_path",
}
SOURCE_KEYS = {"schema_version", "profile", "mode", "batch_id", "prepared_at", "approval", "items", "zero_recipient_reason"}
BASE_ITEM_KEYS = {
    "account_id", "organization", "domain", "observed_at", "jurisdiction",
    "entity_type", "channel", "planned_at", "message_version", "recipient_route",
    "source_urls", "verified_facts", "inferences", "score", "suppression",
    "approval", "draft", "claim_ledger",
}
PIPELINE_ITEM_KEYS = {"selected_use_case", "capability_claims", "message_quality", "pipeline_state", "pipeline_stages"}
PIPELINE_STAGE_NAMES = ["research", "qualification", "use_case", "draft", "critic", "verification"]
PIPELINE_CAPABILITY_CLAIM = (
    "Axon maps one approved non-production procedure to an exact target and "
    "returns a reviewable evidence bundle."
)
USE_CASE_KEYS = {
    "use_case_id", "title", "problem_hypothesis", "owner_roles",
    "supporting_evidence_ids", "fit_score", "capability_id",
}
QUALITY_CHECK_KEYS = {"subject_length", "body_length", "single_question", "capability_exact", "opt_out"}
FORBIDDEN_PERSONAL_KEYS = {"contact_name", "email", "first_name", "last_name", "linkedin_url", "person_name", "phone", "recipient_name"}
FORBIDDEN_CLAIMS = ("exactly once", "guaranteed", "production-ready", "production ready", "unattended execution", "live logs")
PLACEHOLDER = re.compile(r"{{[^{}]+}}|\[[A-Z][A-Z0-9_ -]*\]")
BATCH_ID = re.compile(r"[a-z0-9][a-z0-9._-]{2,79}")
EMAIL_ADDRESS = re.compile(r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?![\w-])", re.IGNORECASE)
LINKEDIN_PERSON_PROFILE = re.compile(r"(?:https?://)?(?:[a-z0-9-]+\.)?linkedin\.com/(?:in|pub|profile)(?:[/?:#]|$)", re.IGNORECASE)
PHONE_LIKE_CONTACT = re.compile(
    r"(?<![\w])(?:\+\d{1,3}(?:[\s().-]*\d){7,14}|\(\d{2,4}\)[\s.-]*\d{3,5}[\s.-]*\d{3,5}|\d{3,5}[\s.-]\d{3,5}[\s.-]\d{3,5}|\d{4,5}\s+\d{4,5})(?![\w])"
)


class ManifestError(ValueError):
    """An input is unsafe or incomplete for review."""


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _exact(value: Any, label: str, allowed: set[str], *, optional: set[str] | None = None) -> dict[str, Any]:
    try:
        return exact_mapping(value, label, allowed, optional=optional or set())
    except ValidationError as exc:
        raise ManifestError(str(exc)) from exc


def _text(value: Any, label: str, *, max_chars: int = 10_000, multiline: bool = True) -> str:
    try:
        return safe_text(value, label, max_chars=max_chars, multiline=multiline)
    except ValidationError as exc:
        raise ManifestError(str(exc)) from exc


def _time(value: Any, label: str) -> str:
    try:
        return timestamp(value, label)[0]
    except ValidationError as exc:
        raise ManifestError(str(exc)) from exc


def _url(value: Any, label: str) -> str:
    try:
        return public_https_url(value, label)
    except ValidationError as exc:
        raise ManifestError(str(exc)) from exc


def _walk_keys(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, Mapping):
        for key, nested in value.items():
            keys.add(str(key).lower())
            keys.update(_walk_keys(nested))
    elif isinstance(value, list):
        for nested in value:
            keys.update(_walk_keys(nested))
    return keys


def _walk_text(value: Any, label: str):
    if isinstance(value, Mapping):
        for key, nested in value.items():
            yield from _walk_text(nested, f"{label}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            yield from _walk_text(nested, f"{label}[{index}]")
    elif isinstance(value, str):
        yield label, value


def _validate_text_boundary(value: Any, label: str) -> None:
    for value_label, text in _walk_text(value, label):
        _text(text, value_label)
        if EMAIL_ADDRESS.search(text):
            raise ManifestError(f"{value_label} contains an email address")
        if LINKEDIN_PERSON_PROFILE.search(text):
            raise ManifestError(f"{value_label} contains a LinkedIn personal-profile URL")
        if PHONE_LIKE_CONTACT.search(text):
            raise ManifestError(f"{value_label} contains a phone-like contact string")


def _validate_approval(value: Any, label: str) -> dict[str, Any]:
    approval = _exact(value, label, {"status", "approved_by", "approved_at", "approval_expires_at"})
    if approval["status"] != "pending":
        raise ManifestError(f"{label}.status must remain pending in dry-run")
    for key in {"approved_by", "approved_at", "approval_expires_at"}:
        if approval[key] is not None:
            raise ManifestError(f"{label}.{key} must be null in dry-run")
    return approval


def _validate_score(value: Any, label: str) -> dict[str, Any]:
    score = _exact(value, label, {"rubric_version", "components", "total"})
    components = _exact(score["components"], f"{label}.components", SCORE_KEYS)
    if any(type(points) is not int or not 0 <= points <= 2 for points in components.values()):
        raise ManifestError(f"{label}.components values must be integers from 0 to 2")
    total = score["total"]
    if type(total) is not int or total != sum(components.values()):
        raise ManifestError(f"{label}.total must equal the component sum")
    if total < QUALIFICATION_THRESHOLD:
        raise ManifestError(f"{label}.total must be at least {QUALIFICATION_THRESHOLD}")
    if score["rubric_version"] != "2026-09-12":
        raise ManifestError(f"{label}.rubric_version must be 2026-09-12")
    return {"rubric_version": score["rubric_version"], "components": components, "total": total}


def _validate_suppression(value: Any, label: str) -> dict[str, Any]:
    suppression = _exact(value, label, {"checked", "status", "checked_at", "reason"})
    if suppression["checked"] is not True or suppression["status"] != "clear":
        raise ManifestError(f"{label} must be checked and clear")
    suppression["checked_at"] = _time(suppression["checked_at"], f"{label}.checked_at")
    if suppression["reason"] is not None:
        raise ManifestError(f"{label}.reason must be null when status is clear")
    return suppression


def _validate_pipeline_fields(item: dict[str, Any], label: str) -> None:
    present = PIPELINE_ITEM_KEYS.intersection(item)
    if present and present != PIPELINE_ITEM_KEYS:
        missing = sorted(PIPELINE_ITEM_KEYS - present)
        raise ManifestError(f"{label} has incomplete pipeline fields: {missing}")
    if not present:
        return

    use_case = _exact(item["selected_use_case"], f"{label}.selected_use_case", USE_CASE_KEYS)
    for key in ("use_case_id", "title", "problem_hypothesis", "capability_id"):
        use_case[key] = _text(use_case[key], f"{label}.selected_use_case.{key}")
    if use_case["capability_id"] != "assessment_evidence_v1":
        raise ManifestError(f"{label}.selected_use_case.capability_id is unsupported")
    for key in ("owner_roles", "supporting_evidence_ids"):
        values = use_case[key]
        if not isinstance(values, list) or not values:
            raise ManifestError(f"{label}.selected_use_case.{key} must be a non-empty text list")
        use_case[key] = [
            _text(value, f"{label}.selected_use_case.{key}[{index}]")
            for index, value in enumerate(values)
        ]
    if type(use_case["fit_score"]) is not int or not 7 <= use_case["fit_score"] <= 10:
        raise ManifestError(f"{label}.selected_use_case.fit_score must be an integer from 7 to 10")
    item["selected_use_case"] = use_case

    if item["capability_claims"] != [PIPELINE_CAPABILITY_CLAIM]:
        raise ManifestError(f"{label}.capability_claims must match the approved capability ledger")

    quality = _exact(item["message_quality"], f"{label}.message_quality", {"score", "checks", "findings"})
    checks = _exact(quality["checks"], f"{label}.message_quality.checks", QUALITY_CHECK_KEYS)
    if any(type(value) is not bool for value in checks.values()):
        raise ManifestError(f"{label}.message_quality.checks values must be booleans")
    expected_score = sum(2 for value in checks.values() if value)
    if quality["score"] != expected_score or expected_score != 10:
        raise ManifestError(f"{label}.message_quality.score must be a passing recomputed score of 10")
    expected_findings = [name for name, passed in checks.items() if not passed]
    if quality["findings"] != expected_findings:
        raise ManifestError(f"{label}.message_quality.findings does not match its checks")
    item["message_quality"] = {"score": 10, "checks": checks, "findings": []}

    if item["pipeline_state"] != "AWAITING_HUMAN_APPROVAL":
        raise ManifestError(f"{label}.pipeline_state must await human approval")
    if item["pipeline_stages"] != PIPELINE_STAGE_NAMES:
        raise ManifestError(f"{label}.pipeline_stages must match the approved role order")


def _validate_item(raw: Any, index: int) -> dict[str, Any]:
    label = f"items[{index}]"
    item = copy.deepcopy(_exact(raw, label, BASE_ITEM_KEYS | PIPELINE_ITEM_KEYS | {"research_provenance"}, optional=PIPELINE_ITEM_KEYS | {"research_provenance"}))
    forbidden = FORBIDDEN_PERSONAL_KEYS.intersection(_walk_keys(item))
    if forbidden:
        raise ManifestError(f"{label} contains forbidden personal-data keys: {sorted(forbidden)}")
    _validate_text_boundary(item, label)
    _validate_pipeline_fields(item, label)
    if "research_provenance" in item:
        if not PIPELINE_ITEM_KEYS <= item.keys():
            raise ManifestError(f"{label}.research_provenance requires complete pipeline fields")
        entries = item["research_provenance"]
        if not isinstance(entries, list) or not entries:
            raise ManifestError(f"{label}.research_provenance must be a non-empty list")
        normalized = []
        for evidence_index, raw in enumerate(entries):
            evidence_label = f"{label}.research_provenance[{evidence_index}]"
            entry = _exact(raw, evidence_label, {"evidence_id", "source_url", "fact_type", "fact_text", "source_capture"})
            entry["evidence_id"] = _text(entry["evidence_id"], f"{evidence_label}.evidence_id")
            entry["source_url"] = _url(entry["source_url"], f"{evidence_label}.source_url")
            entry["fact_text"] = _text(entry["fact_text"], f"{evidence_label}.fact_text")
            if entry["fact_type"] not in set(SCORE_FACT_TYPES.values()) | {"dated_trigger", "service_offering"}:
                raise ManifestError(f"{evidence_label}.fact_type is unsupported")
            try:
                entry["source_capture"] = validate_capture(entry["source_capture"], f"{evidence_label}.source_capture")
            except ValidationError as exc:
                raise ManifestError(str(exc)) from exc
            normalized.append(entry)
        if len({x["evidence_id"] for x in normalized}) != len(normalized):
            raise ManifestError(f"{label}.research_provenance evidence IDs must be unique")
        item["research_provenance"] = normalized

    for key in ("account_id", "organization", "domain", "jurisdiction", "entity_type", "channel", "message_version"):
        item[key] = _text(item[key], f"{label}.{key}")
    item["observed_at"] = _time(item["observed_at"], f"{label}.observed_at")
    item["planned_at"] = _time(item["planned_at"], f"{label}.planned_at")
    if item["jurisdiction"].lower() == "unknown" or item["entity_type"].lower() == "unknown":
        raise ManifestError(f"{label} requires known jurisdiction and entity_type")
    if item["channel"] not in {"business_email", "organization_contact_form"}:
        raise ManifestError(f"{label}.channel is unsupported")

    route = _exact(item["recipient_route"], f"{label}.recipient_route", {"route_type", "role"})
    route["route_type"] = _text(route["route_type"], f"{label}.recipient_route.route_type")
    route["role"] = _text(route["role"], f"{label}.recipient_route.role")
    item["recipient_route"] = route

    sources = item["source_urls"]
    if not isinstance(sources, list) or not sources:
        raise ManifestError(f"{label}.source_urls must be a non-empty list")
    item["source_urls"] = [_url(value, f"{label}.source_urls[{i}]") for i, value in enumerate(sources)]

    facts = item["verified_facts"]
    if not isinstance(facts, list) or not facts:
        raise ManifestError(f"{label}.verified_facts must contain non-empty text")
    item["verified_facts"] = [_text(value, f"{label}.verified_facts[{i}]") for i, value in enumerate(facts)]
    inferences = item["inferences"]
    if not isinstance(inferences, list):
        raise ManifestError(f"{label}.inferences must be a text list")
    item["inferences"] = [_text(value, f"{label}.inferences[{i}]") for i, value in enumerate(inferences)]

    item["score"] = _validate_score(item["score"], f"{label}.score")
    item["suppression"] = _validate_suppression(item["suppression"], f"{label}.suppression")
    item["approval"] = _validate_approval(item["approval"], f"{label}.approval")

    draft = _exact(item["draft"], f"{label}.draft", {"subject", "body"})
    draft["subject"] = _text(draft["subject"], f"{label}.draft.subject", max_chars=200)
    draft["body"] = _text(draft["body"], f"{label}.draft.body")
    combined = f"{draft['subject']}\n{draft['body']}"
    if PLACEHOLDER.search(combined):
        raise ManifestError(f"{label}.draft contains an unresolved placeholder")
    found = [claim for claim in FORBIDDEN_CLAIMS if claim in combined.lower()]
    if found:
        raise ManifestError(f"{label}.draft contains forbidden claims: {found}")
    item["draft"] = draft

    ledger = item["claim_ledger"]
    if not isinstance(ledger, list) or not ledger:
        raise ManifestError(f"{label}.claim_ledger must be a non-empty list")
    normalized_ledger = []
    for ledger_index, raw_entry in enumerate(ledger):
        claim_label = f"{label}.claim_ledger[{ledger_index}]"
        claim = _exact(raw_entry, claim_label, {"kind", "text", "source_url"})
        if claim["kind"] not in {"verified_fact", "inference"}:
            raise ManifestError(f"{claim_label}.kind is invalid")
        claim["text"] = _text(claim["text"], f"{claim_label}.text")
        claim["source_url"] = _url(claim["source_url"], f"{claim_label}.source_url")
        if claim["source_url"] not in item["source_urls"]:
            raise ManifestError(f"{claim_label} source is not in source_urls")
        normalized_ledger.append(claim)
    item["claim_ledger"] = normalized_ledger
    if "research_provenance" in item:
        if not all(entry["source_url"] in item["source_urls"] for entry in item["research_provenance"]):
            raise ManifestError(f"{label}.research_provenance source must appear in source_urls")
        fact_sources = {x["source_url"] for x in normalized_ledger if x["kind"] == "verified_fact"}
        provenance_sources = {x["source_url"] for x in item["research_provenance"]}
        if not fact_sources <= provenance_sources:
            raise ManifestError(f"{label}.verified facts require research provenance")
        provenance_facts = sorted((entry["fact_text"], entry["source_url"]) for entry in item["research_provenance"])
        ledger_facts = sorted((claim["text"], claim["source_url"]) for claim in normalized_ledger if claim["kind"] == "verified_fact")
        if provenance_facts != ledger_facts:
            raise ManifestError(f"{label}.research_provenance must match verified claim ledger")
        fact_types = {entry["fact_type"] for entry in item["research_provenance"]}
        if any(SCORE_FACT_TYPES[name] not in fact_types for name, value in item["score"]["components"].items() if value > 0):
            raise ManifestError(f"{label}.positive scores require matching verified provenance")
        if not all(entry["source_capture"]["source_url"] == entry["source_url"] for entry in item["research_provenance"]):
            raise ManifestError(f"{label}.research_provenance capture URL mismatch")
        if not all(entry["source_capture"]["excerpt"] == entry["fact_text"] for entry in item["research_provenance"]):
            raise ManifestError(f"{label}.research_provenance fact must match the captured excerpt")

    stable_key = {"account_id": item["account_id"], "channel": item["channel"], "message_version": item["message_version"], "draft": draft}
    item["idempotency_key"] = _sha256(stable_key)
    item["state"] = "dry_run"
    return item


def build_manifest(source: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize a batch into a deterministic dry-run manifest."""

    data = copy.deepcopy(_exact(source, "source", SOURCE_KEYS, optional={"zero_recipient_reason"}))
    if data["schema_version"] != SCHEMA_VERSION:
        raise ManifestError(f"schema_version must be {SCHEMA_VERSION}")
    if data["profile"] != PROFILE:
        raise ManifestError(f"profile must be {PROFILE}")
    if data["mode"] != MODE:
        raise ManifestError("mode is locked to dry_run")
    batch_id = _text(data["batch_id"], "batch_id", multiline=False)
    if not BATCH_ID.fullmatch(batch_id):
        raise ManifestError("batch_id must be a safe lowercase identifier")
    prepared_at = _time(data["prepared_at"], "prepared_at")
    approval = _validate_approval(data["approval"], "approval")
    items = data["items"]
    if not isinstance(items, list):
        raise ManifestError("items must be a list")
    zero_recipient_reason = None
    if not items:
        zero_recipient_reason = _text(data.get("zero_recipient_reason"), "zero_recipient_reason")
    elif "zero_recipient_reason" in data:
        raise ManifestError("zero_recipient_reason is only valid for an empty batch")

    normalized = [_validate_item(item, index) for index, item in enumerate(items)]
    ids = [item["account_id"] for item in normalized]
    if len(ids) != len(set(ids)):
        raise ManifestError("account_id values must be unique within a batch")

    manifest: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "profile": PROFILE,
        "mode": MODE,
        "batch_id": batch_id,
        "prepared_at": prepared_at,
        "approval": approval,
        "capabilities": {
            "can_send": False,
            "can_access_mailbox": False,
            "can_access_provider": False,
            "can_load_credentials": False,
        },
        "items": normalized,
    }
    if not normalized:
        manifest["zero_recipient_reason"] = zero_recipient_reason
        manifest["suppression"] = {
            "checked": False,
            "status": "not_applicable_no_recipients",
            "checked_at": None,
            "reason": zero_recipient_reason,
        }
    manifest["manifest_sha256"] = _sha256(manifest)
    return manifest


def verify_manifest(manifest: Mapping[str, Any]) -> bool:
    """Verify checksum and the complete semantic dry-run contract."""

    try:
        candidate = copy.deepcopy(dict(manifest))
        recorded = candidate.pop("manifest_sha256")
        if not isinstance(recorded, str) or not hmac.compare_digest(recorded, _sha256(candidate)):
            return False
        expected_top = {"schema_version", "profile", "mode", "batch_id", "prepared_at", "approval", "capabilities", "items"}
        if not candidate.get("items"):
            expected_top |= {"zero_recipient_reason", "suppression"}
        if set(candidate) != expected_top:
            return False
        if candidate["capabilities"] != {
            "can_send": False,
            "can_access_mailbox": False,
            "can_access_provider": False,
            "can_load_credentials": False,
        }:
            return False
        source = {key: copy.deepcopy(candidate[key]) for key in ("schema_version", "profile", "mode", "batch_id", "prepared_at", "approval")}
        source["items"] = []
        for raw_item in candidate["items"]:
            item = copy.deepcopy(dict(raw_item))
            item.pop("idempotency_key", None)
            item.pop("state", None)
            source["items"].append(item)
        if not source["items"]:
            source["zero_recipient_reason"] = candidate["zero_recipient_reason"]
        return build_manifest(source) == dict(manifest)
    except (KeyError, TypeError, ValueError):
        return False


def write_manifest(manifest: Mapping[str, Any], output_dir: Path) -> Path:
    """Write once using a checksum-addressed filename; existing files are immutable."""

    if not verify_manifest(manifest):
        raise ManifestError("manifest checksum is invalid")
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{manifest['batch_id']}.{manifest['manifest_sha256']}.json"
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, sort_keys=True, indent=2)
        handle.write("\n")
    return target
