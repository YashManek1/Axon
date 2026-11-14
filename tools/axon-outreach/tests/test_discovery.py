from __future__ import annotations

import copy
import json
import smtplib
import socket
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from axon_outreach.discovery import (  # noqa: E402
    DiscoveryError, build_discovery_packet, verify_discovery_packet, write_discovery_packet,
)
from axon_outreach.manifest import verify_manifest  # noqa: E402
from axon_outreach.pipeline import verify_bundle  # noqa: E402
from axon_outreach.source_capture import capture_source  # noqa: E402


def sample_input() -> dict:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    excerpt = "Example Cloud offers managed infrastructure operations."
    capture = capture_source(
        excerpt, source_url="https://example.com/services", source_type="first_party_site",
        retrieved_at=now, published_at=None, excerpt=excerpt,
    )
    return {
        "schema_version": 1, "batch_id": "example-discovery", "prepared_at": now,
        "accounts": [{"account_id": "example", "organization": "Example Cloud", "domain": "example.com",
                      "role_category": "Operations lead", "workflow_label": "infrastructure delivery",
                      "facts": [{"evidence_id": "site-1", "text": excerpt, "source_capture": capture}],
                      "exclusions": []}],
    }


class DiscoveryTests(unittest.TestCase):
    def test_recent_undated_first_party_service_page_is_review_only(self) -> None:
        packet = build_discovery_packet(sample_input())
        item = packet["items"][0]
        self.assertTrue(verify_discovery_packet(packet))
        self.assertEqual(packet["state"], "DISCOVERY_REVIEW_ONLY")
        self.assertEqual(item["qualification_status"], "not_assessed")
        self.assertTrue(item["requires_human_source_review"])
        self.assertIn("own_repeated_procedure", item["unknowns"])
        self.assertFalse(any(packet["capabilities"].values()))
        self.assertFalse(verify_manifest(packet))
        self.assertFalse(verify_bundle(packet))
        self.assertNotIn("score", json.dumps(packet))
        self.assertNotIn("recipient", json.dumps(packet))
        self.assertNotIn("AWAITING_HUMAN_APPROVAL", json.dumps(packet))

    def test_no_network_or_mail_transport(self) -> None:
        with patch.object(socket, "socket") as network, patch.object(smtplib, "SMTP") as smtp:
            build_discovery_packet(sample_input())
        network.assert_not_called()
        smtp.assert_not_called()

    def test_old_and_future_capture_rejected(self) -> None:
        for delta in (timedelta(days=-31), timedelta(days=1)):
            with self.subTest(delta=delta):
                data = sample_input()
                prepared = datetime.fromisoformat(data["prepared_at"])
                data["accounts"][0]["facts"][0]["source_capture"]["retrieved_at"] = (prepared + delta).isoformat()
                with self.assertRaises(DiscoveryError):
                    build_discovery_packet(data)

    def test_backdated_preparation_cannot_freshen_old_capture(self) -> None:
        data = sample_input()
        old = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()
        data["prepared_at"] = old
        data["accounts"][0]["facts"][0]["source_capture"]["retrieved_at"] = old
        with self.assertRaises(DiscoveryError):
            build_discovery_packet(data)

    def test_capture_stale_now_despite_freshness_relative_to_prepared(self) -> None:
        data = sample_input()
        now = datetime.now(timezone.utc)
        data["prepared_at"] = (now - timedelta(days=29)).isoformat()
        data["accounts"][0]["facts"][0]["source_capture"]["retrieved_at"] = (now - timedelta(days=58)).isoformat()
        with self.assertRaises(DiscoveryError):
            build_discovery_packet(data, now=now)

    def test_personal_contact_hidden_in_source_url_rejected(self) -> None:
        for tail in ("?email=person@example.com", "?email=person%40example.com", "?email=person%2540example.com", "?email=person%25252540example.com"):
            with self.subTest(tail=tail):
                data = sample_input()
                data["accounts"][0]["facts"][0]["source_capture"]["source_url"] += tail
                with self.assertRaises(DiscoveryError):
                    build_discovery_packet(data)

    def test_exclusions_cross_domain_and_claim_inflation_rejected(self) -> None:
        cases = [
            lambda d: d["accounts"][0]["exclusions"].append("direct competitor"),
            lambda d: d["accounts"][0]["facts"][0]["source_capture"].update(source_url="https://other.com/"),
            lambda d: d["accounts"][0]["facts"][0].update(text="We urgently need Axon."),
        ]
        for change in cases:
            with self.subTest(change=change):
                data = sample_input()
                change(data)
                with self.assertRaises(DiscoveryError):
                    build_discovery_packet(data)

    def test_personal_contact_data_rejected(self) -> None:
        data = sample_input()
        data["accounts"][0]["role_category"] = "person@example.com"
        with self.assertRaises(DiscoveryError):
            build_discovery_packet(data)

    def test_packet_tamper_and_write_once(self) -> None:
        packet = build_discovery_packet(sample_input())
        changed = copy.deepcopy(packet)
        changed["items"][0]["draft"]["body"] = "Different claim"
        self.assertFalse(verify_discovery_packet(changed))
        with tempfile.TemporaryDirectory() as temp:
            path = write_discovery_packet(packet, Path(temp))
            self.assertTrue(path.exists())
            with self.assertRaises(FileExistsError):
                write_discovery_packet(packet, Path(temp))

    def test_three_real_accounts_remain_unqualified(self) -> None:
        source = json.loads((ROOT / "input" / "first-client-discovery-2026-09-23.json").read_text(encoding="utf-8"))
        packet = build_discovery_packet(source, now=datetime.fromisoformat(source["prepared_at"]))
        self.assertEqual(len(packet["items"]), 3)
        self.assertTrue(all(item["qualification_status"] == "not_assessed" for item in packet["items"]))
        self.assertTrue(all(item["requires_human_source_review"] for item in packet["items"]))


if __name__ == "__main__":
    unittest.main()
