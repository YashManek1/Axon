from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(TESTS))

from axon_outreach.manifest import ManifestError, build_manifest, verify_manifest
from test_manifest import qualified_input
from axon_outreach.pipeline import build_campaign_bundle
from test_pipeline import qualified_pipeline_input


def rehash(manifest: dict) -> None:
    candidate = copy.deepcopy(manifest)
    candidate.pop("manifest_sha256", None)
    encoded = json.dumps(
        candidate, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    manifest["manifest_sha256"] = hashlib.sha256(encoded).hexdigest()


class SecurityBoundaryTests(unittest.TestCase):
    def test_unknown_source_and_item_fields_are_rejected(self) -> None:
        source = qualified_input()
        source["transport"] = "smtp"
        with self.assertRaisesRegex(ManifestError, "source must contain exactly"):
            build_manifest(source)

        source = qualified_input()
        source["items"][0]["send_now"] = True
        with self.assertRaisesRegex(ManifestError, r"items\[0\] must contain exactly"):
            build_manifest(source)

    def test_control_and_bidirectional_text_are_rejected(self) -> None:
        for unsafe in ("safe\x00hidden", "safe\u202ehidden"):
            with self.subTest(value=repr(unsafe)):
                source = qualified_input()
                source["items"][0]["organization"] = unsafe
                with self.assertRaisesRegex(ManifestError, "control or formatting"):
                    build_manifest(source)

    def test_non_public_source_url_is_rejected(self) -> None:
        source = qualified_input()
        source["items"][0]["source_urls"] = ["https://127.0.0.1/internal"]
        source["items"][0]["claim_ledger"][0]["source_url"] = (
            "https://127.0.0.1/internal"
        )
        with self.assertRaisesRegex(ManifestError, "non-public IP"):
            build_manifest(source)

    def test_recomputed_checksum_cannot_bypass_semantic_verification(self) -> None:
        manifest = build_manifest(qualified_input())
        manifest["capabilities"]["can_send"] = True
        rehash(manifest)
        self.assertFalse(verify_manifest(manifest))

        manifest = build_manifest(qualified_input())
        manifest["items"][0]["state"] = "approved"
        rehash(manifest)
        self.assertFalse(verify_manifest(manifest))


    def test_manifest_rejects_tampered_pipeline_capability_with_recomputed_checksum(self) -> None:
        manifest = build_campaign_bundle(qualified_pipeline_input())["manifest"]
        manifest["items"][0]["capability_claims"] = [
            "Axon guarantees unattended production execution."
        ]
        rehash(manifest)
        self.assertFalse(verify_manifest(manifest))

    def test_manifest_rejects_incomplete_pipeline_fields_with_recomputed_checksum(self) -> None:
        manifest = build_campaign_bundle(qualified_pipeline_input())["manifest"]
        manifest["items"][0].pop("message_quality")
        rehash(manifest)
        self.assertFalse(verify_manifest(manifest))

    def test_unknown_ledger_field_is_rejected(self) -> None:
        source = qualified_input()
        source["items"][0]["claim_ledger"][0]["confidence"] = "high"
        with self.assertRaisesRegex(ManifestError, "claim_ledger"):
            build_manifest(source)


if __name__ == "__main__":
    unittest.main()
