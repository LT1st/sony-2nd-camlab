#!/usr/bin/env python3
"""
Camera Lab · Asset Manifest & License Validator (Python CLI)
Verifies:
  1. assets/manifest.json has >= 12 licensed samples and >= 3 Ghost pairs
  2. Every entry has required fields, license, SHA256, file existence, and canRedistribute=True
  3. M1 precomputed RAW stages in assets/generated/sample-001/ match pipeline.json SHA256s
"""

from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    manifest_path = ROOT / "assets" / "manifest.json"
    if not manifest_path.exists():
        print("ERROR: assets/manifest.json missing", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = manifest.get("assets", [])
    if len(assets) < 12:
        print(f"ERROR: Expected at least 12 assets, found {len(assets)}", file=sys.stderr)
        return 1

    required_fields = [
        "id",
        "title",
        "sourceUrl",
        "downloadUrl",
        "author",
        "license",
        "licenseUrl",
        "attribution",
        "sha256",
        "width",
        "height",
        "type",
        "canRedistribute",
        "cameraModel",
    ]

    ghost_pairs = set()
    for item in assets:
        for rf in required_fields:
            if rf not in item:
                print(f"ERROR: Asset {item.get('id')} missing field '{rf}'", file=sys.stderr)
                return 1
        if not item["canRedistribute"]:
            print(f"ERROR: Asset {item['id']} is not marked canRedistribute=True", file=sys.stderr)
            return 1

        sample_file = ROOT / "assets" / "samples" / f"{item['id']}.jpg"
        public_file = ROOT / "apps" / "web" / "public" / "assets" / "samples" / f"{item['id']}.jpg"
        license_file = ROOT / "assets" / "licenses" / f"{item['id']}.LICENSE.txt"

        for f in (sample_file, public_file, license_file):
            if not f.exists():
                print(f"ERROR: Missing file {f}", file=sys.stderr)
                return 1

        digest = sha256_file(sample_file)
        if digest != item["sha256"]:
            print(f"ERROR: SHA256 mismatch for {sample_file}: expected {item['sha256']}, got {digest}", file=sys.stderr)
            return 1

        if item.get("ghostPairId"):
            ghost_pairs.add(item["ghostPairId"])

    if len(ghost_pairs) < 3:
        print(f"ERROR: Expected at least 3 ghost pairs, found {len(ghost_pairs)}", file=sys.stderr)
        return 1

    # Check all M1 precomputed RAW directories
    raw_assets = [a for a in assets if a.get("pipelineMode") == "RAW_PIPELINE_PRECOMPUTED"]
    total_stages = 0
    for raw_asset in raw_assets:
        raw_dir = ROOT / "assets" / "generated" / raw_asset["id"]
        pipeline_path = raw_dir / "pipeline.json"
        meta_path = raw_dir / "original.meta.json"
        if not pipeline_path.exists() or not meta_path.exists():
            print(f"ERROR: Missing M1 precomputed RAW metadata in {raw_dir}", file=sys.stderr)
            return 1

        pipeline = json.loads(pipeline_path.read_text(encoding="utf-8"))
        for stage in pipeline.get("stages", []):
            sf = raw_dir / stage["file"]
            if not sf.exists():
                print(f"ERROR: Missing RAW stage file {sf}", file=sys.stderr)
                return 1
            if sha256_file(sf) != stage["sha256"]:
                print(f"ERROR: SHA256 mismatch on RAW stage file {sf}", file=sys.stderr)
                return 1
            total_stages += 1

    print(
        f"OK: Validated {len(assets)} licensed assets, {len(ghost_pairs)} Ghost pairs, "
        f"{len(raw_assets)} M1 RAW datasets ({total_stages} stage files)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
