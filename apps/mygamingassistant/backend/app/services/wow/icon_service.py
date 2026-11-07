"""WoW Forever images from object storage — in-game icons and World Map satellite views.

Both are published per client build by a script (``python -m scripts.wow_icons.publish``,
``python -m scripts.wow_satellite.publish``) under ``wow/{build}/{kind}/{name}.webp``
(R2 in prod, MinIO locally). The API serves them same-origin, so they load in
the Discord Activity and need no public bucket host. A key never changes once
written, so bytes are kept in a small in-process cache per kind.

Every kind has a strict allowlist: a client build plus a file name its own
pattern accepts. Nothing else ever reaches a storage key.
"""
from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Final

from minio.error import S3Error
from starlette.concurrency import run_in_threadpool

from app.core.storage import get_storage
from app.services.wow.asset_kind import AssetKind

logger = logging.getLogger(__name__)

# A client build ("1.60.1.70790") — nothing else ever names a build folder.
_BUILD: Final = re.compile(r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,7}")
_MISSING_CODES: Final = frozenset({"NoSuchKey", "NoSuchObject"})
# ~1,300 icons at ~1 KB each: the whole set fits.
_ICON_CACHE_ENTRIES: Final = 4096
# Satellite views are 100-400 KB each; keep the most-viewed few dozen.
_SATELLITE_CACHE_ENTRIES: Final = 32

ICONS: Final = "icons"
SATELLITE: Final = "satellite"


@lru_cache(maxsize=_ICON_CACHE_ENTRIES)
def _cached_download(key: str) -> bytes:
    return get_storage().download_file(key)


@lru_cache(maxsize=_SATELLITE_CACHE_ENTRIES)
def _cached_satellite_download(key: str) -> bytes:
    return get_storage().download_file(key)


_KINDS: Final[dict[str, AssetKind]] = {
    # A FileDataID.
    ICONS: AssetKind(re.compile(r"(\d{1,10})\.webp"), _cached_download),
    # A UiMap id.
    SATELLITE: AssetKind(re.compile(r"(\d{1,6})\.webp"), _cached_satellite_download),
}


def asset_key(kind: str, build: str, file_name: str) -> str | None:
    """The storage key for ``/wow/{kind}/{build}/{file_name}``, or None if any part is malformed."""
    spec = _KINDS.get(kind)
    if spec is None or not _BUILD.fullmatch(build):
        return None
    match = spec.file_name.fullmatch(file_name)
    if not match:
        return None
    return f"wow/{build}/{kind}/{int(match.group(1))}.webp"


def _read(kind: str, key: str) -> bytes | None:
    try:
        return _KINDS[kind].download(key)
    except S3Error as exc:
        if exc.code in _MISSING_CODES:
            return None
        logger.warning("WoW image read failed: key=%s code=%s message=%s", key, exc.code, exc.message)
        raise


async def asset_bytes(kind: str, build: str, file_name: str) -> bytes | None:
    """The image's WebP bytes; None when the name is malformed or the image isn't published."""
    key = asset_key(kind, build, file_name)
    if key is None:
        return None
    return await run_in_threadpool(_read, kind, key)
