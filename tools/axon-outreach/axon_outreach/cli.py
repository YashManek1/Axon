"""Constrained CLI: read reviewed local input and emit a local dry-run manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .manifest import build_manifest, write_manifest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
INPUT_ROOT = PACKAGE_ROOT / "input"
OUTPUT_ROOT = PACKAGE_ROOT / "output"


def _confined(root: Path, value: str) -> Path:
    path = (root / value).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"path must remain inside {root}") from exc
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a locked Axon dry-run manifest")
    parser.add_argument("input_name", help="JSON filename below tools/axon-outreach/input")
    args = parser.parse_args(argv)
    source_path = _confined(INPUT_ROOT, args.input_name)
    with source_path.open("r", encoding="utf-8") as handle:
        source = json.load(handle)
    manifest = build_manifest(source)
    target = write_manifest(manifest, OUTPUT_ROOT)
    print(target.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
