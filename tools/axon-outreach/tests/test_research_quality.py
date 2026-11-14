"""Synthetic quality evaluation: structural enforcement is not semantic truth."""
from __future__ import annotations

import json
import smtplib
import socket
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from axon_outreach.pipeline import build_campaign_bundle, verify_bundle
from axon_outreach.source_capture import capture_source

CASES = Path(__file__).with_name("research_quality_cases.json")


def evaluation_input(case: dict) -> dict:
    data = json.loads((ROOT / "input" / "synthetic-agent-pipeline.json").read_text(encoding="utf-8"))
    account = data["accounts"][0]
    evidence = account["evidence"]
    edit = case["edit"]
    if edit in {"age_120", "age_121"}:
        age = int(edit.split("_")[1])
        evidence[0]["source_capture"]["published_at"] = (
            datetime.fromisoformat(data["prepared_at"]) - timedelta(days=age)
        ).isoformat()
    elif edit == "undated":
        evidence[0]["source_capture"]["published_at"] = None
    elif edit == "future_publication":
        evidence[0]["source_capture"]["published_at"] = "2026-09-20T09:00:00+05:30"
    elif edit == "wrong_type":
        evidence[1]["fact_type"] = "service_offering"
    elif edit == "missing_type":
        evidence[1]["fact_type"] = None
    elif edit == "unselected_buyer":
        account["candidate_use_cases"][0]["supporting_evidence_ids"].remove("public-owner")
    elif edit in {"vague_pain", "weak_buyer", "vague_assessment"}:
        index, text = {
            "vague_pain": (1, "Synthetic Platform aims to improve reliability."),
            "weak_buyer": (2, "Synthetic Platform has a platform engineering team."),
            "vague_assessment": (3, "Synthetic Platform offers assessment services."),
        }[edit]
        entry = evidence[index]
        old = entry["source_capture"]
        entry["text"] = text
        entry["source_capture"] = capture_source(
            text, source_url=entry["source_url"], source_type=old["source_type"],
            published_at=old["published_at"], retrieved_at=old["retrieved_at"],
            excerpt=text,
        )
    elif edit != "none":
        raise AssertionError(f"Unknown evaluation edit: {edit}")
    return data


class ResearchQualityEvaluationTests(unittest.TestCase):
    def test_labeled_structural_checks_and_explicit_semantic_gaps(self) -> None:
        cases = json.loads(CASES.read_text(encoding="utf-8"))
        self.assertEqual(len({case["id"] for case in cases}), len(cases))
        structural = known_semantic_gaps = 0
        for case in cases:
            with self.subTest(case=case["id"], human_label=case["label"]):
                self.assertTrue(case["rationale"])
                with patch.object(socket, "socket") as network, patch.object(smtplib, "SMTP") as smtp:
                    bundle = build_campaign_bundle(evaluation_input(case))
                network.assert_not_called()
                smtp.assert_not_called()
                self.assertTrue(verify_bundle(bundle))
                self.assertTrue(all(value is False for value in bundle["capabilities"].values()))
                decision = bundle["decisions"][0]
                self.assertEqual(decision["reason_code"], case["reason"])
                if case["reason"] == "SEMANTIC_REVIEW_REQUIRED":
                    self.assertEqual(decision["state"], "AWAITING_EVIDENCE_REVIEW")
                    self.assertEqual(decision["evidence_status"], "SUPPLIED_UNVERIFIED")
                    self.assertEqual(bundle["manifest"]["approval"]["status"], "pending")
                    self.assertFalse(bundle["manifest"]["capabilities"]["can_send"])
                    self.assertEqual(bundle["manifest"]["items"], [])
                else:
                    self.assertEqual(bundle["manifest"]["items"], [])
                if case["enforceable"]:
                    structural += 1
                else:
                    self.assertEqual(case["label"], "insufficient_human_evidence")
                    self.assertEqual(decision["state"], "AWAITING_EVIDENCE_REVIEW")
                    known_semantic_gaps += 1
        # These are separate denominators, not an overall research-quality pass rate.
        self.assertEqual(structural, 8)
        self.assertEqual(known_semantic_gaps, 3)


if __name__ == "__main__":
    unittest.main()
