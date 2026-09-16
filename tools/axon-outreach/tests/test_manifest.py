from __future__ import annotations

import copy
import json
import socket
import smtplib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from axon_outreach.cli import INPUT_ROOT, _confined  # noqa: E402
from axon_outreach.manifest import (  # noqa: E402
    ManifestError,
    build_manifest,
    verify_manifest,
    write_manifest,
)


def qualified_input() -> dict:
    return {
        "schema_version": 1,
        "profile": "axon_b2b",
        "mode": "dry_run",
        "batch_id": "synthetic-review-001",
        "prepared_at": "2026-09-16T10:00:00+05:30",
        "approval": {
            "status": "pending",
            "approved_by": None,
            "approved_at": None,
            "approval_expires_at": None,
        },
        "items": [
            {
                "account_id": "synthetic-ops-001",
                "organization": "Synthetic Ops Ltd",
                "domain": "example.invalid",
                "observed_at": "2026-09-16T09:00:00+05:30",
                "jurisdiction": "Test jurisdiction",
                "entity_type": "Limited company",
                "channel": "organization_contact_form",
                "planned_at": "2026-09-18T15:00:00+05:30",
                "message_version": "v1",
                "recipient_route": {"route_type": "public organization form", "role": "operations owner"},
                "source_urls": ["https://example.invalid/services"],
                "verified_facts": ["The synthetic fixture describes recurring managed operations."],
                "inferences": ["A non-production assessment may be useful."],
                "score": {
                    "rubric_version": "2026-09-12",
                    "components": {
                        "repeated_procedure": 2,
                        "cost_or_failure_pain": 2,
                        "buyer_access_or_budget": 2,
                        "current_alternative_gap": 1,
                        "safe_assessment_path": 1,
                    },
                    "total": 8,
                },
                "suppression": {
                    "checked": True,
                    "status": "clear",
                    "checked_at": "2026-09-16T09:30:00+05:30",
                    "reason": None,
                },
                "approval": {
                    "status": "pending",
                    "approved_by": None,
                    "approved_at": None,
                    "approval_expires_at": None,
                },
                "draft": {
                    "subject": "A smaller way to review recurring ops work",
                    "body": "Your public services describe recurring managed operations. Axon can map one authorized non-production procedure and return a reviewable evidence bundle. Is that worth a short scoping call?",
                },
                "claim_ledger": [
                    {
                        "kind": "verified_fact",
                        "text": "Public services describe recurring managed operations.",
                        "source_url": "https://example.invalid/services",
                    }
                ],
            }
        ],
    }


class ManifestTests(unittest.TestCase):
    def test_zero_recipient_manifest_is_valid_review_artifact(self) -> None:
        data = qualified_input()
        data["batch_id"] = "zero-qualified-2026-09-16"
        data["items"] = []
        data["zero_recipient_reason"] = (
            "No organization met the 7/10 cold-outreach threshold."
        )

        manifest = build_manifest(data)

        self.assertEqual(manifest["items"], [])
        self.assertEqual(
            manifest["suppression"]["status"],
            "not_applicable_no_recipients",
        )
        self.assertFalse(manifest["suppression"]["checked"])
        self.assertEqual(manifest["approval"]["status"], "pending")
        self.assertFalse(manifest["capabilities"]["can_send"])
        self.assertTrue(verify_manifest(manifest))
        with tempfile.TemporaryDirectory() as temp_dir:
            target = write_manifest(manifest, Path(temp_dir))
            on_disk = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(on_disk["items"], [])
            self.assertTrue(verify_manifest(on_disk))

    def test_zero_recipient_manifest_requires_reason(self) -> None:
        data = qualified_input()
        data["items"] = []
        with self.assertRaisesRegex(ManifestError, "zero_recipient_reason"):
            build_manifest(data)
    def test_build_is_deterministic_and_checksum_verifies(self) -> None:
        first = build_manifest(qualified_input())
        second = build_manifest(qualified_input())
        self.assertEqual(first, second)
        self.assertTrue(verify_manifest(first))

    def test_content_change_changes_checksum(self) -> None:
        first = build_manifest(qualified_input())
        changed = qualified_input()
        changed["items"][0]["draft"]["subject"] += "?"
        second = build_manifest(changed)
        self.assertNotEqual(first["manifest_sha256"], second["manifest_sha256"])

    def test_write_is_checksum_addressed_and_write_once(self) -> None:
        manifest = build_manifest(qualified_input())
        with tempfile.TemporaryDirectory() as temp_dir:
            target = write_manifest(manifest, Path(temp_dir))
            self.assertIn(manifest["manifest_sha256"], target.name)
            on_disk = json.loads(target.read_text(encoding="utf-8"))
            self.assertTrue(verify_manifest(on_disk))
            with self.assertRaises(FileExistsError):
                write_manifest(manifest, Path(temp_dir))

    def test_below_threshold_is_rejected(self) -> None:
        data = qualified_input()
        data["items"][0]["score"]["components"]["safe_assessment_path"] = 0
        data["items"][0]["score"]["components"]["current_alternative_gap"] = 0
        data["items"][0]["score"]["total"] = 6
        with self.assertRaisesRegex(ManifestError, "at least 7"):
            build_manifest(data)

    def test_suppressed_item_is_rejected(self) -> None:
        data = qualified_input()
        data["items"][0]["suppression"].update(status="suppressed", reason="opt-out")
        with self.assertRaisesRegex(ManifestError, "checked and clear"):
            build_manifest(data)

    def test_approval_cannot_be_promoted(self) -> None:
        data = qualified_input()
        data["approval"].update(status="approved", approved_by="reviewer")
        with self.assertRaisesRegex(ManifestError, "remain pending"):
            build_manifest(data)

    def test_mode_is_locked(self) -> None:
        data = qualified_input()
        data["mode"] = "send"
        with self.assertRaisesRegex(ManifestError, "locked to dry_run"):
            build_manifest(data)

    def test_personal_data_key_is_rejected(self) -> None:
        data = qualified_input()
        data["items"][0]["recipient_route"]["email"] = "person@example.invalid"
        with self.assertRaisesRegex(ManifestError, "personal-data"):
            build_manifest(data)

    def test_email_address_in_text_value_is_rejected(self) -> None:
        data = qualified_input()
        data["items"][0]["draft"]["body"] += " Reply to owner@example.com."
        with self.assertRaisesRegex(ManifestError, "email address"):
            build_manifest(data)

    def test_linkedin_person_profile_url_is_rejected(self) -> None:
        data = qualified_input()
        data["items"][0]["source_urls"][0] = (
            "https://www.linkedin.com/in/example-person"
        )
        data["items"][0]["claim_ledger"][0]["source_url"] = (
            "https://www.linkedin.com/in/example-person"
        )
        with self.assertRaisesRegex(ManifestError, "personal-profile URL"):
            build_manifest(data)

    def test_phone_like_contact_strings_are_rejected(self) -> None:
        unsafe_values = (
            "+91 98765 43210",
            "(415) 555-2671",
            "020 7946 0958",
            "98765 43210",
        )
        for phone_like in unsafe_values:
            with self.subTest(phone_like=phone_like):
                data = qualified_input()
                data["items"][0]["verified_facts"].append(
                    f"Public contact route: {phone_like}"
                )
                with self.assertRaisesRegex(ManifestError, "phone-like"):
                    build_manifest(data)

    def test_business_urls_and_iso_timestamps_remain_valid(self) -> None:
        data = qualified_input()
        company_url = (
            "https://www.linkedin.com/company/synthetic-ops-24/"
        )
        dated_url = "https://ops-24.example.invalid/services/2026-09-16"
        data["items"][0]["domain"] = "ops-24.example.invalid"
        data["items"][0]["source_urls"] = [company_url, dated_url]
        data["items"][0]["claim_ledger"][0]["source_url"] = dated_url

        manifest = build_manifest(data)

        self.assertTrue(verify_manifest(manifest))
        self.assertEqual(
            manifest["items"][0]["observed_at"],
            "2026-09-16T09:00:00+05:30",
        )
        self.assertIn(company_url, manifest["items"][0]["source_urls"])

    def test_placeholder_and_forbidden_claim_are_rejected(self) -> None:
        for unsafe_body in ("Hello {{name}}", "Guaranteed production-ready execution"):
            with self.subTest(unsafe_body=unsafe_body):
                data = qualified_input()
                data["items"][0]["draft"]["body"] = unsafe_body
                with self.assertRaises(ManifestError):
                    build_manifest(data)

    def test_input_path_cannot_escape_local_package(self) -> None:
        with self.assertRaises(ValueError):
            _confined(INPUT_ROOT, "../../../../Users/Yash/OneDrive/Desktop/Outreach/.env")

    def test_generation_opens_no_network_or_mail_transport(self) -> None:
        with patch.object(socket, "socket") as socket_mock, patch.object(smtplib, "SMTP") as smtp_mock:
            manifest = build_manifest(qualified_input())
        socket_mock.assert_not_called()
        smtp_mock.assert_not_called()
        self.assertFalse(manifest["capabilities"]["can_send"])
        self.assertTrue(all(item["state"] == "dry_run" for item in manifest["items"]))


if __name__ == "__main__":
    unittest.main()
