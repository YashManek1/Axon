"""Build a local discovery-review packet from manually supplied source excerpts."""

from __future__ import annotations

import argparse
import json

from .cli import INPUT_ROOT, OUTPUT_ROOT, _confined
from .discovery import build_discovery_packet, write_discovery_packet


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build an unqualified Axon discovery review packet")
    parser.add_argument("input_name", help="JSON filename below tools/axon-outreach/input")
    args = parser.parse_args(argv)
    source_path = _confined(INPUT_ROOT, args.input_name)
    with source_path.open("r", encoding="utf-8") as handle:
        source = json.load(handle)
    packet = build_discovery_packet(source)
    target = write_discovery_packet(packet, OUTPUT_ROOT)
    print(target.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
