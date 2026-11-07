"""Publish the icons ``wowIcons.json`` uses to object storage, as WebP.

    python -m scripts.wow_icons.publish --to r2       # production (Cloudflare R2)
    python -m scripts.wow_icons.publish --to local    # local MinIO, for the dev server
    python -m scripts.wow_icons.publish --dry-run     # count what would upload

Run from ``backend/`` after ``scripts.wow_icons.build``. Each icon is fetched
from wago.tools (the pinned client build; one at a time, cached on disk,
retried with back-off), converted to WebP and uploaded to
``wow/{build}/icons/{fileDataId}.webp`` with a year-long immutable
Cache-Control. Keys already in the bucket are skipped, so a re-run after a
failure only does what is left. The API serves them at
``/api/wow/icons/{build}/{fileDataId}.webp`` (``app/api/wow_icons.py``).

``--to r2`` reads ``scripts/.env.r2`` (gitignored; see ``.env.r2.example``) —
the values are never printed. ``--to local`` uses ``backend/.env``'s MinIO.
"""
from __future__ import annotations

import argparse
import json
import time
from collections.abc import Callable

from scripts.wow_assets.asset_bucket import AssetBucket
from scripts.wow_assets.minio_bucket import open_bucket
from scripts.wow_assets.upload import report, upload_missing
from scripts.wow_icons.build import OUT_FILE
from scripts.wow_icons.ids import icon_file_ids
from scripts.wow_icons.images import blp_to_webp, icon_key
from scripts.wow_world_map.walk.client_files import client_file

# Between downloads that miss the disk cache: a free community service, so a few a second at most.
DOWNLOAD_PAUSE_S = 0.25


def _icon_body(file_id: int) -> Callable[[], bytes]:
    def make() -> bytes:
        started = time.monotonic()
        body = blp_to_webp(client_file(file_id))
        if time.monotonic() - started > 0.05:  # a real download, not the disk cache
            time.sleep(DOWNLOAD_PAUSE_S)
        return body

    return make


def publish(build: str, file_ids: list[int], bucket: AssetBucket | None) -> dict[str, int]:
    """Upload every icon not already in ``bucket``; ``None`` = dry run. Returns the counts."""
    return upload_missing([(icon_key(build, file_id), _icon_body(file_id)) for file_id in file_ids], bucket)


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish WoW Forever icons to object storage.")
    parser.add_argument("--to", choices=("r2", "local"), default="r2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    icon_map = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    build = icon_map["build"]
    file_ids = icon_file_ids(icon_map)
    bucket = None if args.dry_run else open_bucket(args.to)
    print(f"{'DRY RUN - ' if args.dry_run else ''}{len(file_ids)} icons for build {build} -> {args.to}", flush=True)
    print(report(publish(build, file_ids, bucket)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
