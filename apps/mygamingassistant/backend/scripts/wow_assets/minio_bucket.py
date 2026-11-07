"""The R2 / MinIO bucket WoW images are published to.

``open_bucket("r2")`` reads ``scripts/.env.r2`` (gitignored; see
``.env.r2.example``) — the values are never printed. ``open_bucket("local")``
uses ``backend/.env``'s MinIO.
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Final

from minio import Minio
from minio.error import S3Error

from app.core.config import settings
from scripts.publish_clips_to_r2 import _r2_client
from scripts.wow_assets.headers import CACHE_CONTROL, CONTENT_TYPE

BACKEND_DIR: Final = Path(__file__).resolve().parents[2]
ENV_R2: Final = BACKEND_DIR / "scripts" / ".env.r2"
MISSING_CODES: Final = frozenset({"NoSuchKey", "NoSuchObject"})


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


def open_bucket(target: str) -> MinioBucket:
    """The R2 (``scripts/.env.r2``) or local MinIO bucket WoW images are published to."""
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
