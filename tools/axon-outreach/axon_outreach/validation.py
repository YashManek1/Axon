"""Shared, deterministic validation for untrusted outreach artifacts."""

from __future__ import annotations

import ipaddress
import unicodedata
from datetime import datetime
from typing import Any, Collection, Mapping
from urllib.parse import urlparse


class ValidationError(ValueError):
    """An untrusted outreach value violates the local policy boundary."""


def exact_mapping(
    value: Any, label: str, allowed: Collection[str], *, optional: Collection[str] = ()
) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise ValidationError(f"{label} must be an object")
    result = dict(value)
    allowed_set = set(allowed)
    optional_set = set(optional)
    required = allowed_set - optional_set
    if set(result) - allowed_set or required - set(result):
        raise ValidationError(
            f"{label} must contain exactly required={sorted(required)} "
            f"and optional={sorted(optional_set)}"
        )
    return result


def safe_text(
    value: Any, label: str, *, max_chars: int = 4096, multiline: bool = False
) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be text")
    normalized = unicodedata.normalize("NFKC", value).strip()
    if not normalized or len(normalized) > max_chars:
        raise ValidationError(f"{label} must contain 1..{max_chars} characters")
    for character in normalized:
        if multiline and character in {"\n", "\t"}:
            continue
        if unicodedata.category(character).startswith("C"):
            raise ValidationError(f"{label} contains a control or formatting character")
    return normalized


def timestamp(value: Any, label: str) -> tuple[str, datetime]:
    text = safe_text(value, label, max_chars=64)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ValidationError(f"{label} must include a timezone")
    return text, parsed


def public_https_url(value: Any, label: str) -> str:
    url = safe_text(value, label, max_chars=2048)
    parsed = urlparse(url)
    hostname = parsed.hostname
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise ValidationError(
            f"{label} must be a public HTTPS URL without credentials or fragments"
        )
    host = hostname.rstrip(".").casefold()
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValidationError(f"{label} must not use a local hostname")
    try:
        address = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        try:
            ascii_host = host.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise ValidationError(f"{label} has an invalid hostname") from exc
        if "." not in ascii_host or any(
            not part or len(part) > 63 for part in ascii_host.split(".")
        ):
            raise ValidationError(f"{label} must use a fully qualified hostname")
    else:
        if not address.is_global:
            raise ValidationError(f"{label} must not use a non-public IP address")
    return url
