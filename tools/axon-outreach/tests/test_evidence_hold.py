"""V3 fail-closed release tests; hashes are not human review signatures."""
from __future__ import annotations

import copy
import hashlib
import json
import smtplib
import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from axon_outreach.pipeline import (
    EVIDENCE_HOLD_REASON, PipelineError, build_campaign_bundle, verify_bundle,
)
from test_pipeline import qualified_pipeline_input
from axon_outreach.manifest import SCORE_FACT_TYPES
from axon_outreach.source_capture import capture_source


def reseal(value: dict, field: str) -> None:
    value.pop(field, None)
    value[field] = hashlib.sha256(json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


class EvidenceHoldTests(unittest.TestCase):
    def assert_hold(self, bundle: dict, count: int = 1) -> None:
        self.assertTrue(verify_bundle(bundle))
        self.assertEqual(bundle["pipeline_version"], 3)
        manifest = bundle["manifest"]
        self.assertEqual(manifest["items"], [])
        self.assertEqual(manifest["zero_recipient_reason"], EVIDENCE_HOLD_REASON)
        self.assertEqual(manifest["suppression"]["status"], "not_applicable_no_recipients")
        self.assertEqual(manifest["approval"], {
            "status": "pending", "approved_by": None, "approved_at": None,
            "approval_expires_at": None,
        })
        self.assertTrue(all(value is False for value in bundle["capabilities"].values()))
        self.assertTrue(all(value is False for value in manifest["capabilities"].values()))
        held = [d for d in bundle["decisions"] if d["state"] == "AWAITING_EVIDENCE_REVIEW"]
        self.assertEqual(len(held), count)
        for decision in held:
            self.assertEqual(set(decision), {
                "account_id", "state", "reason_code", "use_case_id", "proposed_score",
                "proposed_use_case_fit", "evidence_status",
            })
            self.assertEqual(decision["reason_code"], "SEMANTIC_REVIEW_REQUIRED")
            self.assertEqual(decision["evidence_status"], "SUPPLIED_UNVERIFIED")
        serialized = json.dumps(bundle)
        for forbidden in ('"body"', '"subject"', '"recipient_route"', '"research_provenance"',
                          '"QUALIFIED_REVIEW_ONLY"', '"AWAITING_HUMAN_APPROVAL"'):
            self.assertNotIn(forbidden, serialized)

    def test_empty_all_rejected_and_mixed_batches(self) -> None:
        for scenario in ("empty", "rejected", "mixed"):
            with self.subTest(scenario=scenario):
                data = qualified_pipeline_input()
                if scenario == "empty":
                    data["accounts"] = []
                elif scenario == "rejected":
                    data["accounts"][0]["score"]["total"] = 0
                else:
                    rejected = copy.deepcopy(data["accounts"][0])
                    rejected["account_id"] = "synthetic-rejected"
                    rejected["score"]["total"] = 0
                    suppressed = copy.deepcopy(rejected)
                    suppressed["account_id"] = "synthetic-suppressed"
                    suppressed["suppression"].update(status="suppressed", reason="opt-out")
                    data["accounts"] += [rejected, suppressed]
                bundle = build_campaign_bundle(data)
                self.assert_hold(bundle, 1 if scenario == "mixed" else 0)
                if scenario == "mixed":
                    self.assertEqual([d["state"] for d in bundle["decisions"]],
                                     ["AWAITING_EVIDENCE_REVIEW", "REJECTED", "SUPPRESSED"])

    def test_score_and_fit_boundaries_remain_structural(self) -> None:
        for total, components in ((7, [2, 2, 1, 0, 2]), (10, [2, 2, 2, 2, 2])):
            for fit in (7, 10):
                with self.subTest(total=total, fit=fit):
                    data = qualified_pipeline_input()
                    score = data["accounts"][0]["score"]
                    score["components"] = dict(zip(score["components"], components))
                    score["total"] = total
                    if total == 10:
                        account = data["accounts"][0]
                        text = "Synthetic Platform reports that its current handoff tool lacks procedure evidence."
                        url = "https://example.invalid/reports/alternative-gap"
                        account["evidence"].append({
                            "evidence_id": "synthetic-alternative-gap", "kind": "verified_fact",
                            "fact_type": SCORE_FACT_TYPES["current_alternative_gap"],
                            "text": text, "source_url": url,
                            "observed_at": "2026-09-19T09:00:00+05:30", "is_trigger": False,
                            "source_capture": capture_source(text, source_url=url,
                                source_type="first_party_site", excerpt=text,
                                published_at="2026-09-18T08:00:00+05:30",
                                retrieved_at="2026-09-19T09:00:00+05:30"),
                        })
                        account["candidate_use_cases"][0]["supporting_evidence_ids"].append(
                            "synthetic-alternative-gap")
                    data["accounts"][0]["candidate_use_cases"][0]["fit_score"] = fit
                    self.assert_hold(build_campaign_bundle(data))
        for field, value in (("total", True), ("component", True), ("fit", True),
                             ("fit", 11), ("fit", 6), ("total", 6)):
            with self.subTest(field=field, value=value):
                data = qualified_pipeline_input()
                account = data["accounts"][0]
                if field == "fit":
                    account["candidate_use_cases"][0]["fit_score"] = value
                elif field == "component":
                    account["score"]["components"]["repeated_procedure"] = value
                else:
                    account["score"]["total"] = value
                    if value == 6 and type(value) is int:
                        account["score"]["components"] = dict(zip(
                            account["score"]["components"], [2, 1, 1, 1, 1]))
                bundle = build_campaign_bundle(data)
                self.assertEqual(bundle["decisions"][0]["state"], "REJECTED")
                self.assert_hold(bundle, 0)

    def test_caller_cannot_add_review_approval_escape_hatch(self) -> None:
        for field in ("approval", "approved_by", "reviewer", "reviewed_at", "review_token"):
            with self.subTest(field=field):
                data = qualified_pipeline_input()
                data["accounts"][0][field] = "caller-claim"
                bundle = build_campaign_bundle(data)
                self.assertEqual(bundle["decisions"][0]["reason_code"], "MANIFEST_REJECTED")
                self.assert_hold(bundle, 0)

    def test_manifest_safety_preflight_runs_before_hold(self) -> None:
        with patch("axon_outreach.pipeline.build_manifest", side_effect=__import__(
                "axon_outreach.manifest", fromlist=["ManifestError"]).ManifestError("blocked")):
            with self.assertRaises(PipelineError):
                build_campaign_bundle(qualified_pipeline_input())

    def test_ephemeral_candidates_are_checked_then_discarded(self) -> None:
        from axon_outreach.manifest import build_manifest
        checked = []
        def record_preflight(source):
            checked.append(copy.deepcopy(source))
            return build_manifest(source)
        with patch("axon_outreach.pipeline.build_manifest", side_effect=record_preflight) as preflight:
            bundle = build_campaign_bundle(qualified_pipeline_input())
        self.assertEqual(preflight.call_count, 2)
        self.assertEqual(len(checked[0]["items"]), 1)
        self.assertIn("draft", checked[0]["items"][0])
        self.assertIn("research_provenance", checked[0]["items"][0])
        self.assertEqual(checked[1]["items"], [])
        self.assert_hold(bundle)

    def test_recomputed_checksum_cannot_forge_release_or_review(self) -> None:
        original = build_campaign_bundle(qualified_pipeline_input())
        mutations = [
            lambda b: b["decisions"][0].update(state="AWAITING_HUMAN_APPROVAL"),
            lambda b: b["decisions"][0].update(reason_code="QUALIFIED_REVIEW_ONLY"),
            lambda b: b["decisions"][0].update(reviewed_at="2026-09-20"),
            lambda b: b["decisions"][0].update(evidence_status="AUTHENTICATED"),
            lambda b: b["decisions"][0].update(proposed_use_case_fit=True),
            lambda b: b["decisions"][0].update(proposed_use_case_fit=11),
            lambda b: b["decisions"][0]["proposed_score"].update(total=True),
            lambda b: b["decisions"][0]["proposed_score"].update(total=0),
            lambda b: b["decisions"][0]["proposed_score"].update(reviewer="fake"),
            lambda b: b["decisions"][0]["proposed_score"]["components"].update(repeated_procedure=True),
            lambda b: b["manifest"]["approval"].update(status="approved"),
            lambda b: b["manifest"]["capabilities"].update(can_send=True),
            lambda b: b["manifest"]["capabilities"].update(can_send=0),
            lambda b: b["capabilities"].update(can_send=0),
            lambda b: b["manifest"].update(zero_recipient_reason="Ready"),
            lambda b: b.update(batch_id="different-batch"),
            lambda b: b.update(prepared_at="2026-09-21T10:00:00+05:30"),
            lambda b: b.update(profile="different-profile"),
            lambda b: b.update(decisions=[{"account_id": "fake", "state": "REJECTED",
                                         "reason_code": "QUALIFIED_REVIEW_ONLY"}]),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                changed = copy.deepcopy(original)
                mutate(changed)
                reseal(changed["manifest"], "manifest_sha256")
                reseal(changed, "bundle_sha256")
                self.assertFalse(verify_bundle(changed))
        historical = json.loads((Path(__file__).parent / "fixtures" / "historical-v2.pipeline.json").read_text())
        changed = copy.deepcopy(original)
        changed["manifest"] = historical["manifest"]
        reseal(changed, "bundle_sha256")
        self.assertFalse(verify_bundle(changed))

    def test_historical_v1_v2_are_structurally_verifiable_not_rewritten(self) -> None:
        paths = [next((ROOT / "output").glob("synthetic-agent-pipeline-*.pipeline.json")),
                 Path(__file__).parent / "fixtures" / "historical-v2.pipeline.json"]
        for version, path in enumerate(paths, start=1):
            with self.subTest(version=version):
                before = path.read_bytes()
                bundle = json.loads(before)
                self.assertEqual(bundle["pipeline_version"], version)
                self.assertTrue(verify_bundle(bundle))
                self.assertEqual(path.read_bytes(), before)
        missing = json.loads(paths[1].read_bytes())
        missing["manifest"]["items"][0].pop("research_provenance")
        reseal(missing["manifest"], "manifest_sha256")
        reseal(missing, "bundle_sha256")
        self.assertFalse(verify_bundle(missing))

    def test_generation_does_not_open_transport(self) -> None:
        with patch.object(socket, "socket") as network, patch.object(smtplib, "SMTP") as smtp:
            self.assert_hold(build_campaign_bundle(qualified_pipeline_input()))
        network.assert_not_called()
        smtp.assert_not_called()


if __name__ == "__main__":
    unittest.main()
