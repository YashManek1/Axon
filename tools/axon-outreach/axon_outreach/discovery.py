"""Local, unqualified discovery review packets. Never a send manifest."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import unquote, urlparse

from .pipeline import CAPABILITIES
from .source_capture import validate_capture
from .validation import ValidationError, exact_mapping, public_https_url, safe_text, timestamp

MAX_CAPTURE_AGE = timedelta(days=30)
BATCH_ID = re.compile(r"[a-z0-9][a-z0-9._-]{2,79}\Z")
PERSONAL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|linkedin\.com/(?:in|pub)/|\+\d[\d .()-]{7,}", re.I)
UNKNOWN_GATES = ["own_repeated_procedure", "measured_pain", "alternative_gap", "budget_owner", "safe_target_permission"]


class DiscoveryError(ValueError):
    pass


def _digest(value: Mapping[str, Any]) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _text(value: Any, label: str, max_chars: int = 300) -> str:
    text = safe_text(value, label, max_chars=max_chars)
    if PERSONAL.search(text):
        raise DiscoveryError(f"{label} contains personal contact data")
    return text


def _domain(value: Any) -> str:
    domain = _text(value, "domain", 253).lower().rstrip(".")
    if "/" in domain or ":" in domain or not re.fullmatch(r"[a-z0-9.-]+", domain) or "." not in domain:
        raise DiscoveryError("domain must be a public DNS name")
    public_https_url(f"https://{domain}/", "domain")
    return domain


def build_discovery_packet(source: Mapping[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """Validate researcher-supplied excerpts and prepare a review-only draft."""
    try:
        data = exact_mapping(source, "source", {"schema_version", "batch_id", "prepared_at", "accounts"})
        if data["schema_version"] != 1 or not isinstance(data["batch_id"], str) or not BATCH_ID.fullmatch(data["batch_id"]):
            raise DiscoveryError("unsupported schema or batch_id")
        prepared_text, prepared = timestamp(data["prepared_at"], "prepared_at")
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None or prepared > current + timedelta(minutes=5):
            raise DiscoveryError("prepared_at is in the future or clock is naive")
        if not timedelta(0) <= current - prepared <= MAX_CAPTURE_AGE:
            raise DiscoveryError("prepared_at is older than 30 days")
        accounts = data["accounts"]
        if not isinstance(accounts, list) or not 1 <= len(accounts) <= 10:
            raise DiscoveryError("accounts must contain 1..10 organizations")
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for index, raw in enumerate(accounts):
            account = exact_mapping(raw, f"accounts[{index}]", {
                "account_id", "organization", "domain", "role_category", "workflow_label", "facts", "exclusions",
            })
            account_id = _text(account["account_id"], "account_id", 80)
            if account_id in seen:
                raise DiscoveryError("duplicate account_id")
            seen.add(account_id)
            organization = _text(account["organization"], "organization", 120)
            domain = _domain(account["domain"])
            role = _text(account["role_category"], "role_category", 100)
            workflow = _text(account["workflow_label"], "workflow_label", 80)
            if not isinstance(account["exclusions"], list) or account["exclusions"]:
                raise DiscoveryError("known exclusions block discovery drafting")
            facts = account["facts"]
            if not isinstance(facts, list) or not 1 <= len(facts) <= 5:
                raise DiscoveryError("facts must contain 1..5 captured first-party excerpts")
            validated: list[dict[str, Any]] = []
            evidence_ids: set[str] = set()
            for fact_index, raw_fact in enumerate(facts):
                fact = exact_mapping(raw_fact, f"facts[{fact_index}]", {"evidence_id", "text", "source_capture"})
                evidence_id = _text(fact["evidence_id"], "evidence_id", 80)
                if evidence_id in evidence_ids:
                    raise DiscoveryError("duplicate evidence_id")
                evidence_ids.add(evidence_id)
                text = _text(fact["text"], "fact.text", 1000)
                capture = validate_capture(fact["source_capture"], "source_capture")
                decoded_url = capture["source_url"]
                for _ in range(10):
                    if PERSONAL.search(decoded_url):
                        raise DiscoveryError("source URL contains personal contact data")
                    next_url = unquote(decoded_url)
                    if next_url == decoded_url:
                        break
                    decoded_url = next_url
                else:
                    raise DiscoveryError("source URL decoding depth exceeded")
                host = urlparse(capture["source_url"]).hostname or ""
                if host.lower().rstrip(".") not in {domain, f"www.{domain}"}:
                    raise DiscoveryError("fact source must be on the organization's own domain")
                if capture["source_type"] != "first_party_site" or capture["excerpt"] != text:
                    raise DiscoveryError("fact must match a first-party site excerpt")
                retrieved = timestamp(capture["retrieved_at"], "retrieved_at")[1]
                if retrieved > prepared + timedelta(minutes=5) or not timedelta(0) <= prepared - retrieved <= MAX_CAPTURE_AGE:
                    raise DiscoveryError("fact capture is future-dated or older than 30 days")
                if not timedelta(0) <= current - retrieved <= MAX_CAPTURE_AGE:
                    raise DiscoveryError("fact capture is older than 30 days at packet build time")
                validated.append({"evidence_id": evidence_id, "text": text, "source_capture": capture})
            question = f"If you have recurring {workflow} work, how do you validate it and capture handoff evidence today?"
            subject = f"Question about {workflow} at {organization}"
            body = (f'I noticed this on your site: "{validated[0]["text"]}" ' 'I am building Axon, which maps one approved non-production procedure to an exact target and returns a reviewable evidence bundle. ' f'{question} If this is not relevant, let me know and I will not follow up.')
            if len(subject) > 70 or len(body.split()) > 100:
                raise DiscoveryError("review draft exceeds concise-message limits")
            items.append({
                "account_id": account_id, "organization": organization, "domain": domain,
                "role_category": role, "workflow_label": workflow, "facts": validated,
                "fit_rationale": {"supporting_evidence_ids": sorted(evidence_ids), "hypothesis": f"Possible fit for recurring {workflow} work; unconfirmed."},
                "unknowns": list(UNKNOWN_GATES), "exclusions": [],
                "source_verification": "supplied_capture_not_independently_verified",
                "requires_human_source_review": True, "qualification_status": "not_assessed",
                "discovery_question": question, "draft": {"subject": subject, "body": body},
            })
        packet = {
            "artifact_type": "axon_discovery_review", "schema_version": 1,
            "mode": "dry_run", "state": "DISCOVERY_REVIEW_ONLY", "batch_id": data["batch_id"],
            "prepared_at": prepared_text, "capabilities": copy.deepcopy(CAPABILITIES), "items": items,
        }
        packet["packet_sha256"] = _digest(packet)
        return packet
    except ValidationError as exc:
        raise DiscoveryError(str(exc)) from exc


def verify_discovery_packet(packet: Mapping[str, Any]) -> bool:
    try:
        candidate = copy.deepcopy(dict(packet))
        recorded = candidate.pop("packet_sha256", None)
        if recorded != _digest(candidate):
            return False
        rebuilt = build_discovery_packet({
            "schema_version": candidate["schema_version"], "batch_id": candidate["batch_id"],
            "prepared_at": candidate["prepared_at"],
            "accounts": [{
                "account_id": item["account_id"], "organization": item["organization"],
                "domain": item["domain"], "role_category": item["role_category"],
                "workflow_label": item["workflow_label"],
                "facts": item["facts"], "exclusions": item["exclusions"],
            } for item in candidate["items"]],
        }, now=timestamp(candidate["prepared_at"], "prepared_at")[1])
        return dict(packet) == rebuilt
    except (KeyError, IndexError, TypeError, ValueError):
        return False


def write_discovery_packet(packet: Mapping[str, Any], output_dir: Path) -> Path:
    if not verify_discovery_packet(packet):
        raise DiscoveryError("packet checksum or semantics are invalid")
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{packet['batch_id']}.{packet['packet_sha256']}.discovery.json"
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(packet, handle, ensure_ascii=False, sort_keys=True, indent=2)
        handle.write("\n")
    return path
