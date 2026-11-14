"""Constrained CLI for the policy-first outreach agent pipeline."""

from __future__ import annotations

import argparse
import json

from .cli import INPUT_ROOT, OUTPUT_ROOT, _confined
from .pipeline import build_campaign_bundle, write_bundle


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a locked Axon outreach pipeline review bundle"
    )
    parser.add_argument(
        "input_name", help="JSON filename below tools/axon-outreach/input"
    )
    args = parser.parse_args(argv)
    source_path = _confined(INPUT_ROOT, args.input_name)
    with source_path.open("r", encoding="utf-8") as handle:
        source = json.load(handle)
    bundle = build_campaign_bundle(source)
    target = write_bundle(bundle, OUTPUT_ROOT)
    print(target.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
