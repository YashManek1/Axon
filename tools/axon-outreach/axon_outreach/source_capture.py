"""Capture reviewable provenance from a manually saved public source.

This module deliberately has no HTTP client. A researcher saves a public page
outside the pipeline, then supplies its text and a verbatim excerpt here.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Mapping

from .validation import ValidationError, exact_mapping, public_https_url, safe_text, timestamp

SOURCE_TYPES = {"first_party_site", "first_party_document", "public_registry"}
CAPTURE_KEYS = {
    "source_url", "source_type", "published_at", "retrieved_at", "excerpt",
    "excerpt_sha256", "snapshot_sha256",
}
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate_capture(value: Any, label: str) -> dict[str, Any]:
    capture = exact_mapping(value, label, CAPTURE_KEYS)
    capture["source_url"] = public_https_url(capture["source_url"], f"{label}.source_url")
    if capture["source_type"] not in SOURCE_TYPES:
        raise ValidationError(f"{label}.source_type is unsupported")
    capture["retrieved_at"], retrieved = timestamp(capture["retrieved_at"], f"{label}.retrieved_at")
    if capture["published_at"] is not None:
        capture["published_at"], published = timestamp(capture["published_at"], f"{label}.published_at")
        if published > retrieved:
            raise ValidationError(f"{label}.published_at cannot follow retrieval")
    capture["excerpt"] = safe_text(capture["excerpt"], f"{label}.excerpt", max_chars=1000)
    if not SHA256.fullmatch(str(capture["excerpt_sha256"])) or capture["excerpt_sha256"] != _digest(capture["excerpt"]):
        raise ValidationError(f"{label}.excerpt_sha256 does not match the excerpt")
    if not SHA256.fullmatch(str(capture["snapshot_sha256"])):
        raise ValidationError(f"{label}.snapshot_sha256 must be a SHA-256 digest")
    return capture


def capture_source(
    snapshot: str, *, source_url: str, source_type: str,
    retrieved_at: str, excerpt: str, published_at: str | None = None,
) -> dict[str, Any]:
    """Return metadata for a locally saved snapshot; never fetch or send data."""
    public_https_url(source_url, "source_url")
    if not isinstance(snapshot, str) or not snapshot.strip() or len(snapshot) > 2_000_000:
        raise ValidationError("snapshot must contain 1..2,000,000 characters")
    excerpt = safe_text(excerpt, "excerpt", max_chars=1000)
    if excerpt not in snapshot:
        raise ValidationError("excerpt must occur verbatim in the saved snapshot")
    capture = {
        "source_url": source_url,
        "source_type": source_type,
        "published_at": published_at,
        "retrieved_at": retrieved_at,
        "excerpt": excerpt,
        "excerpt_sha256": _digest(excerpt),
        "snapshot_sha256": _digest(snapshot),
    }
    return validate_capture(capture, "capture")
