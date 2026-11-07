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
import io
import json
import os
import time
from pathlib import Path
from typing import Protocol

from minio import Minio
from minio.error import S3Error

from app.core.config import settings
from scripts.publish_clips_to_r2 import _r2_client
from scripts.wow_icons.build import OUT_FILE
from scripts.wow_icons.ids import icon_file_ids
from scripts.wow_icons.images import CACHE_CONTROL, CONTENT_TYPE, blp_to_webp, icon_key
from scripts.wow_world_map.walk.client_files import client_file

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_R2 = BACKEND_DIR / "scripts" / ".env.r2"
# Between downloads that miss the disk cache: a free community service, so a few a second at most.
DOWNLOAD_PAUSE_S = 0.25
MISSING_CODES = {"NoSuchKey", "NoSuchObject"}


class IconBucket(Protocol):
    def exists(self, key: str) -> bool: ...

    def put(self, key: str, body: bytes) -> None: ...


class MinioBucket:
    """A minio-py client + bucket (R2 and MinIO both speak S3)."""

    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def exists(self, key: str) -> bool:
        try:
            self._client.stat_object(self._bucket, key)
        except S3Error as exc:
            if exc.code in MISSING_CODES:
                return False
            raise
        return True

    def put(self, key: str, body: bytes) -> None:
        self._client.put_object(
            self._bucket,
            key,
            io.BytesIO(body),
            length=len(body),
            content_type=CONTENT_TYPE,
            metadata={"Cache-Control": CACHE_CONTROL},
        )


def _load_env_r2() -> None:
    if not ENV_R2.exists():
        raise SystemExit(f"{ENV_R2} not found; R2 credentials are required to publish (see .env.r2.example).")
    for line in ENV_R2.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def _bucket(target: str) -> MinioBucket:
    if target == "r2":
        _load_env_r2()
        return MinioBucket(*_r2_client())
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    return MinioBucket(client, settings.minio_bucket)


def publish(build: str, file_ids: list[int], bucket: IconBucket | None) -> dict[str, int]:
    """Upload every icon not already in ``bucket``; ``None`` = dry run. Returns the counts."""
    counts = {"uploaded": 0, "present": 0, "would-upload": 0, "bytes": 0}
    for i, file_id in enumerate(file_ids, 1):
        key = icon_key(build, file_id)
        if bucket is None:
            counts["would-upload"] += 1
            continue
        if bucket.exists(key):
            counts["present"] += 1
            continue
        started = time.monotonic()
        body = blp_to_webp(client_file(file_id))
        bucket.put(key, body)
        counts["uploaded"] += 1
        counts["bytes"] += len(body)
        if time.monotonic() - started > 0.05:  # a real download, not the disk cache
            time.sleep(DOWNLOAD_PAUSE_S)
        if i % 100 == 0:
            print(f"  ... {i}/{len(file_ids)}", flush=True)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish WoW Forever icons to object storage.")
    parser.add_argument("--to", choices=("r2", "local"), default="r2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    icon_map = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    build = icon_map["build"]
    file_ids = icon_file_ids(icon_map)
    bucket = None if args.dry_run else _bucket(args.to)
    print(f"{'DRY RUN - ' if args.dry_run else ''}{len(file_ids)} icons for build {build} -> {args.to}", flush=True)
    counts = publish(build, file_ids, bucket)
    print(
        f"done: uploaded={counts['uploaded']} ({counts['bytes'] // 1024} KB) "
        f"already-there={counts['present']} would-upload={counts['would-upload']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
