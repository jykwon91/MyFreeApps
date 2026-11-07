"""Publish the World Map satellite images to object storage.

    python -m scripts.wow_satellite.publish --to r2       # production (Cloudflare R2)
    python -m scripts.wow_satellite.publish --to local    # local MinIO, for the dev server
    python -m scripts.wow_satellite.publish --dry-run     # count what would upload

Run from ``backend/`` after ``scripts.wow_satellite.build``. Uploads each map
``satellite.json`` lists from the build's output folder to
``wow/{build}/satellite/{uiMapId}.webp`` with a year-long immutable
Cache-Control. Keys already in the bucket are skipped, so a re-run only does
what is left. The API serves them at ``/api/wow/satellite/{build}/{uiMapId}.webp``
(``app/api/wow_icons.py``). ``--to r2`` reads ``scripts/.env.r2`` (gitignored)
— the values are never printed.
"""
from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from pathlib import Path

from scripts.wow_assets.asset_bucket import AssetBucket
from scripts.wow_assets.minio_bucket import open_bucket
from scripts.wow_assets.upload import report, upload_missing
from scripts.wow_satellite.build import MANIFEST, OUT_DIR


def satellite_key(build: str, ui_map_id: int) -> str:
    """``wow/1.60.1.70790/satellite/1429.webp`` — the object key the API serves it from."""
    return f"wow/{build}/satellite/{ui_map_id}.webp"


def _image_body(path: Path) -> Callable[[], bytes]:
    def read() -> bytes:
        if not path.exists():
            raise SystemExit(f"{path} is missing - run `python -m scripts.wow_satellite.build` first")
        return path.read_bytes()

    return read


def publish(build: str, map_ids: list[int], src_dir: Path, bucket: AssetBucket | None) -> dict[str, int]:
    """Upload every image not already in ``bucket``; ``None`` = dry run. Returns the counts."""
    items = [(satellite_key(build, ui_map_id), _image_body(src_dir / f"{ui_map_id}.webp")) for ui_map_id in map_ids]
    return upload_missing(items, bucket)


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish the World Map satellite images to object storage.")
    parser.add_argument("--to", choices=("r2", "local"), default="r2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    build = manifest["build"]
    map_ids = [int(m) for m in manifest["maps"]]
    bucket = None if args.dry_run else open_bucket(args.to)
    print(f"{'DRY RUN - ' if args.dry_run else ''}{len(map_ids)} satellite images for build {build} -> {args.to}", flush=True)
    print(report(publish(build, map_ids, OUT_DIR, bucket)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
