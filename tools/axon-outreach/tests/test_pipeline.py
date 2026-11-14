from __future__ import annotations

import copy
import json
import smtplib
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from axon_outreach.pipeline import (  # noqa: E402
    AGENT_SPECS,
    build_campaign_bundle,
    verify_bundle,
    write_bundle,
)


from axon_outreach.source_capture import capture_source  # noqa: E402
from axon_outreach.validation import ValidationError  # noqa: E402


FIXTURE = ROOT / "input" / "synthetic-agent-pipeline.json"


def qualified_pipeline_input() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class OutreachPipelineTests(unittest.TestCase):
    def test_structurally_passing_account_is_held_without_recipients(self) -> None:
        bundle = build_campaign_bundle(qualified_pipeline_input())

        self.assertTrue(verify_bundle(bundle))
        self.assertEqual(
            bundle["decisions"][0]["state"], "AWAITING_EVIDENCE_REVIEW"
        )
        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(bundle["manifest"]["approval"]["status"], "pending")
        self.assertFalse(bundle["manifest"]["capabilities"]["can_send"])
        self.assertFalse(bundle["capabilities"]["can_send"])
        self.assertEqual(
            bundle["decisions"][0]["evidence_status"], "SUPPLIED_UNVERIFIED"
        )

    def test_agent_contracts_are_complete_and_persisted(self) -> None:
        required = {
            "name",
            "role",
            "backstory",
            "purpose",
            "goal",
            "task",
            "input_contract",
            "output_contract",
            "constraints",
            "acceptance_checks",
        }
        bundle = build_campaign_bundle(qualified_pipeline_input())

        self.assertEqual(set(AGENT_SPECS), set(bundle["agents"]))
        self.assertEqual(len(bundle["agent_contracts"]), 6)
        for contract in bundle["agent_contracts"]:
            self.assertEqual(set(contract), required)
            self.assertTrue(contract["constraints"])
            self.assertTrue(contract["acceptance_checks"])

    def test_generation_never_opens_network_or_mail_transport(self) -> None:
        with patch.object(socket, "socket") as socket_mock, patch.object(
            smtplib, "SMTP"
        ) as smtp_mock:
            bundle = build_campaign_bundle(qualified_pipeline_input())

        socket_mock.assert_not_called()
        smtp_mock.assert_not_called()
        self.assertFalse(bundle["capabilities"]["can_research_network"])
        self.assertFalse(bundle["capabilities"]["can_resolve_personal_contacts"])

    def test_stale_trigger_is_rejected(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["evidence"][0]["source_capture"]["published_at"] = (
            "2025-01-01T09:00:00+05:30"
        )

        bundle = build_campaign_bundle(data)

        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(bundle["decisions"][0]["reason_code"], "STALE_RESEARCH")

    def test_recent_retrieval_without_publication_is_not_a_fresh_trigger(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["evidence"][0]["source_capture"]["published_at"] = None
        bundle = build_campaign_bundle(data)
        self.assertEqual(bundle["decisions"][0]["reason_code"], "STALE_RESEARCH")

    def test_high_score_without_matching_verified_pain_is_rejected(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["evidence"][1]["fact_type"] = "service_offering"
        bundle = build_campaign_bundle(data)
        self.assertEqual(bundle["decisions"][0]["reason_code"], "UNSUPPORTED_SCORE")

    def test_score_evidence_must_be_in_selected_use_case(self) -> None:
        data = qualified_pipeline_input()
        ids = data["accounts"][0]["candidate_use_cases"][0]["supporting_evidence_ids"]
        ids.remove("public-incident")
        bundle = build_campaign_bundle(data)
        self.assertEqual(bundle["decisions"][0]["reason_code"], "UNSUPPORTED_SCORE")

    def test_source_capture_url_and_excerpt_hash_are_bound(self) -> None:
        for field, value in (
            ("source_url", "https://example.invalid/unrelated"),
            ("excerpt_sha256", "0" * 64),
        ):
            with self.subTest(field=field):
                data = qualified_pipeline_input()
                data["accounts"][0]["evidence"][0]["source_capture"][field] = value
                bundle = build_campaign_bundle(data)
                self.assertEqual(bundle["decisions"][0]["reason_code"], "SOURCE_CAPTURE_REJECTED")

    def test_verified_fact_must_match_captured_excerpt(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["evidence"][0]["text"] = "Synthetic Platform has an urgent need to buy Axon."
        bundle = build_campaign_bundle(data)
        self.assertEqual(bundle["decisions"][0]["reason_code"], "SOURCE_CAPTURE_REJECTED")

    def test_capture_requires_verbatim_excerpt_from_saved_snapshot(self) -> None:
        with self.assertRaises(ValidationError):
            capture_source(
                "A public test page without the proposed claim",
                source_url="https://example.invalid/source",
                source_type="first_party_site",
                retrieved_at="2026-09-19T09:00:00+05:30",
                published_at="2026-09-18T09:00:00+05:30",
                excerpt="Unsupported claim",
            )

    def test_role_mismatch_is_rejected(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["recipient_route"]["role"] = "finance owner"

        bundle = build_campaign_bundle(data)

        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(bundle["decisions"][0]["reason_code"], "ROLE_MISMATCH")

    def test_unknown_capability_is_rejected(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["candidate_use_cases"][0]["capability_id"] = (
            "automatic-production-execution"
        )

        bundle = build_campaign_bundle(data)

        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(
            bundle["decisions"][0]["reason_code"], "UNSUPPORTED_PRODUCT_CLAIM"
        )

    def test_suppression_overrides_qualification(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["suppression"].update(
            status="suppressed", reason="opt-out"
        )

        bundle = build_campaign_bundle(data)

        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(bundle["decisions"][0]["state"], "SUPPRESSED")
        self.assertEqual(bundle["decisions"][0]["reason_code"], "SUPPRESSED")

    def test_manifest_preflight_rejects_embedded_personal_data(self) -> None:
        data = qualified_pipeline_input()
        data["accounts"][0]["recipient_route"]["email"] = (
            "person@example.invalid"
        )

        bundle = build_campaign_bundle(data)

        self.assertEqual(bundle["manifest"]["items"], [])
        self.assertEqual(
            bundle["decisions"][0]["reason_code"], "MANIFEST_REJECTED"
        )

    def test_bundle_is_deterministic_and_tamper_evident(self) -> None:
        first = build_campaign_bundle(qualified_pipeline_input())
        second = build_campaign_bundle(qualified_pipeline_input())
        self.assertEqual(first, second)
        changed = copy.deepcopy(first)
        changed["decisions"][0]["proposed_use_case_fit"] = 10
        self.assertFalse(verify_bundle(changed))

    def test_bundle_write_is_checksum_addressed_and_write_once(self) -> None:
        bundle = build_campaign_bundle(qualified_pipeline_input())
        with tempfile.TemporaryDirectory() as temp_dir:
            target = write_bundle(bundle, Path(temp_dir))
            self.assertIn(bundle["bundle_sha256"], target.name)
            self.assertTrue(
                verify_bundle(json.loads(target.read_text(encoding="utf-8")))
            )
            with self.assertRaises(FileExistsError):
                write_bundle(bundle, Path(temp_dir))


if __name__ == "__main__":
    unittest.main()
