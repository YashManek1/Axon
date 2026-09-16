"""Build immutable outreach review manifests without any send capability.

This module intentionally uses only local serialization, hashing, and filesystem
operations. It has no mailbox, provider, credential, environment, or network API.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping


PROFILE = "axon_b2b"
MODE = "dry_run"
SCHEMA_VERSION = 1
QUALIFICATION_THRESHOLD = 7
SCORE_KEYS = {
    "repeated_procedure",
    "cost_or_failure_pain",
    "buyer_access_or_budget",
    "current_alternative_gap",
    "safe_assessment_path",
}
FORBIDDEN_PERSONAL_KEYS = {
    "contact_name",
    "email",
    "first_name",
    "last_name",
    "linkedin_url",
    "person_name",
    "phone",
    "recipient_name",
}
FORBIDDEN_CLAIMS = (
    "exactly once",
    "guaranteed",
    "production-ready",
    "production ready",
    "unattended execution",
    "live logs",
)
PLACEHOLDER = re.compile(r"{{[^{}]+}}|\[[A-Z][A-Z0-9_ -]*\]")
BATCH_ID = re.compile(r"[a-z0-9][a-z0-9._-]{2,79}")
EMAIL_ADDRESS = re.compile(
    r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}(?![\w-])",
    re.IGNORECASE,
)
LINKEDIN_PERSON_PROFILE = re.compile(
    r"(?:https?://)?(?:[a-z0-9-]+\.)?linkedin\.com/(?:in|pub|profile)(?:[/?:#]|$)",
    re.IGNORECASE,
)
PHONE_LIKE_CONTACT = re.compile(
    r"(?<![\w])(?:"
    r"\+\d{1,3}(?:[\s().-]*\d){7,14}"
    r"|\(\d{2,4}\)[\s.-]*\d{3,5}[\s.-]*\d{3,5}"
    r"|\d{3,5}[\s.-]\d{3,5}[\s.-]\d{3,5}"
    r"|\d{4,5}\s+\d{4,5}"
    r")(?![\w])"
)


class ManifestError(ValueError):
    """Raised when an input is unsafe or incomplete for review."""


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _sha256(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ManifestError(f"{label} must be an object")
    return value


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ManifestError(f"{label} must be non-empty text")
    return value.strip()


def _require_timestamp(value: Any, label: str) -> str:
    text = _require_text(value, label)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ManifestError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ManifestError(f"{label} must include a timezone")
    return text


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


def _walk_text_values(value: Any, label: str):
    if isinstance(value, Mapping):
        for key, nested in value.items():
            yield from _walk_text_values(nested, f"{label}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            yield from _walk_text_values(nested, f"{label}[{index}]")
    elif isinstance(value, str):
        yield label, value


def _validate_no_personal_values(value: Any, label: str) -> None:
    """Reject contact data embedded in any text value, including draft prose."""

    for value_label, text in _walk_text_values(value, label):
        if EMAIL_ADDRESS.search(text):
            raise ManifestError(f"{value_label} contains an email address")
        if LINKEDIN_PERSON_PROFILE.search(text):
            raise ManifestError(
                f"{value_label} contains a LinkedIn personal-profile URL"
            )
        if PHONE_LIKE_CONTACT.search(text):
            raise ManifestError(f"{value_label} contains a phone-like contact string")


def _validate_approval(value: Any, label: str) -> dict[str, Any]:
    approval = dict(_require_mapping(value, label))
    expected = {"status", "approved_by", "approved_at", "approval_expires_at"}
    if set(approval) != expected:
        raise ManifestError(f"{label} must contain exactly {sorted(expected)}")
    if approval["status"] != "pending":
        raise ManifestError(f"{label}.status must remain pending in dry-run")
    for key in expected - {"status"}:
        if approval[key] is not None:
            raise ManifestError(f"{label}.{key} must be null in dry-run")
    return approval


def _validate_score(value: Any, label: str) -> dict[str, Any]:
    score = dict(_require_mapping(value, label))
    components = dict(_require_mapping(score.get("components"), f"{label}.components"))
    if set(components) != SCORE_KEYS:
        raise ManifestError(f"{label}.components must contain the five rubric dimensions")
    if any(type(points) is not int or points < 0 or points > 2 for points in components.values()):
        raise ManifestError(f"{label}.components values must be integers from 0 to 2")
    total = score.get("total")
    if type(total) is not int or total != sum(components.values()):
        raise ManifestError(f"{label}.total must equal the component sum")
    if total < QUALIFICATION_THRESHOLD:
        raise ManifestError(f"{label}.total must be at least {QUALIFICATION_THRESHOLD}")
    if score.get("rubric_version") != "2026-09-12":
        raise ManifestError(f"{label}.rubric_version must be 2026-09-12")
    return {"rubric_version": score["rubric_version"], "components": components, "total": total}


def _validate_suppression(value: Any, label: str) -> dict[str, Any]:
    suppression = dict(_require_mapping(value, label))
    expected = {"checked", "status", "checked_at", "reason"}
    if set(suppression) != expected:
        raise ManifestError(f"{label} must contain exactly {sorted(expected)}")
    if suppression["checked"] is not True or suppression["status"] != "clear":
        raise ManifestError(f"{label} must be checked and clear")
    _require_timestamp(suppression["checked_at"], f"{label}.checked_at")
    if suppression["reason"] is not None:
        raise ManifestError(f"{label}.reason must be null when status is clear")
    return suppression


def _validate_item(raw: Any, index: int) -> dict[str, Any]:
    label = f"items[{index}]"
    item = copy.deepcopy(dict(_require_mapping(raw, label)))
    forbidden = FORBIDDEN_PERSONAL_KEYS.intersection(_walk_keys(item))
    if forbidden:
        raise ManifestError(f"{label} contains forbidden personal-data keys: {sorted(forbidden)}")
    _validate_no_personal_values(item, label)

    for key in (
        "account_id",
        "organization",
        "domain",
        "observed_at",
        "jurisdiction",
        "entity_type",
        "channel",
        "planned_at",
        "message_version",
    ):
        item[key] = _require_text(item.get(key), f"{label}.{key}")
    _require_timestamp(item["observed_at"], f"{label}.observed_at")
    _require_timestamp(item["planned_at"], f"{label}.planned_at")
    if item["jurisdiction"].lower() == "unknown" or item["entity_type"].lower() == "unknown":
        raise ManifestError(f"{label} requires known jurisdiction and entity_type")
    if item["channel"] not in {"business_email", "organization_contact_form"}:
        raise ManifestError(f"{label}.channel is unsupported")

    route = dict(_require_mapping(item.get("recipient_route"), f"{label}.recipient_route"))
    if set(route) != {"route_type", "role"}:
        raise ManifestError(f"{label}.recipient_route must contain route_type and role only")
    route["route_type"] = _require_text(route["route_type"], f"{label}.recipient_route.route_type")
    route["role"] = _require_text(route["role"], f"{label}.recipient_route.role")
    item["recipient_route"] = route

    sources = item.get("source_urls")
    if not isinstance(sources, list) or not sources:
        raise ManifestError(f"{label}.source_urls must be a non-empty list")
    if any(not isinstance(url, str) or not url.startswith("https://") for url in sources):
        raise ManifestError(f"{label}.source_urls must contain HTTPS URLs")
    facts = item.get("verified_facts")
    if not isinstance(facts, list) or not facts or any(not isinstance(x, str) or not x.strip() for x in facts):
        raise ManifestError(f"{label}.verified_facts must contain non-empty text")
    inferences = item.get("inferences")
    if not isinstance(inferences, list) or any(not isinstance(x, str) or not x.strip() for x in inferences):
        raise ManifestError(f"{label}.inferences must be a text list")

    item["score"] = _validate_score(item.get("score"), f"{label}.score")
    item["suppression"] = _validate_suppression(item.get("suppression"), f"{label}.suppression")
    item["approval"] = _validate_approval(item.get("approval"), f"{label}.approval")

    draft = dict(_require_mapping(item.get("draft"), f"{label}.draft"))
    if set(draft) != {"subject", "body"}:
        raise ManifestError(f"{label}.draft must contain subject and body only")
    draft["subject"] = _require_text(draft["subject"], f"{label}.draft.subject")
    draft["body"] = _require_text(draft["body"], f"{label}.draft.body")
    combined = f"{draft['subject']}\n{draft['body']}"
    if PLACEHOLDER.search(combined):
        raise ManifestError(f"{label}.draft contains an unresolved placeholder")
    lower = combined.lower()
    found = [claim for claim in FORBIDDEN_CLAIMS if claim in lower]
    if found:
        raise ManifestError(f"{label}.draft contains forbidden claims: {found}")
    item["draft"] = draft

    ledger = item.get("claim_ledger")
    if not isinstance(ledger, list) or not ledger:
        raise ManifestError(f"{label}.claim_ledger must be a non-empty list")
    for ledger_index, entry in enumerate(ledger):
        claim = _require_mapping(entry, f"{label}.claim_ledger[{ledger_index}]")
        if claim.get("kind") not in {"verified_fact", "inference"}:
            raise ManifestError(f"{label}.claim_ledger[{ledger_index}].kind is invalid")
        _require_text(claim.get("text"), f"{label}.claim_ledger[{ledger_index}].text")
        url = _require_text(claim.get("source_url"), f"{label}.claim_ledger[{ledger_index}].source_url")
        if url not in sources:
            raise ManifestError(f"{label}.claim_ledger[{ledger_index}] source is not in source_urls")

    stable_key = {
        "account_id": item["account_id"],
        "channel": item["channel"],
        "message_version": item["message_version"],
        "draft": draft,
    }
    item["idempotency_key"] = _sha256(stable_key)
    item["state"] = "dry_run"
    return item


def build_manifest(source: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and normalize a batch into a deterministic dry-run manifest."""

    data = copy.deepcopy(dict(_require_mapping(source, "source")))
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ManifestError(f"schema_version must be {SCHEMA_VERSION}")
    if data.get("profile") != PROFILE:
        raise ManifestError(f"profile must be {PROFILE}")
    if data.get("mode") != MODE:
        raise ManifestError("mode is locked to dry_run")
    batch_id = _require_text(data.get("batch_id"), "batch_id")
    if not BATCH_ID.fullmatch(batch_id):
        raise ManifestError("batch_id must be a safe lowercase identifier")
    prepared_at = _require_timestamp(data.get("prepared_at"), "prepared_at")
    approval = _validate_approval(data.get("approval"), "approval")
    items = data.get("items")
    if not isinstance(items, list):
        raise ManifestError("items must be a list")
    zero_recipient_reason = None
    if not items:
        zero_recipient_reason = _require_text(
            data.get("zero_recipient_reason"), "zero_recipient_reason"
        )
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
    """Return whether the embedded checksum matches the canonical manifest."""

    candidate = copy.deepcopy(dict(manifest))
    recorded = candidate.pop("manifest_sha256", None)
    return isinstance(recorded, str) and recorded == _sha256(candidate)


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
