"""WoW Forever icons — the WebP bytes the WoW pages show next to item and spell names.

The images are published to object storage by ``python -m scripts.wow_icons.publish``
under ``wow/{build}/icons/{fileDataId}.webp`` (R2 in prod, MinIO locally). The
API serves them same-origin, so they load in the Discord Activity and need no
public bucket host. A key never changes once written, so bytes are kept in a
small in-process cache.
"""
from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Final

from minio.error import S3Error
from starlette.concurrency import run_in_threadpool

from app.core.storage import get_storage

logger = logging.getLogger(__name__)

# A client build ("1.60.1.70790") and a FileDataID — nothing else ever reaches a storage key.
_BUILD: Final = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,7}$")
_FILE_NAME: Final = re.compile(r"^(\d{1,10})\.webp$")
_MISSING_CODES: Final = frozenset({"NoSuchKey", "NoSuchObject"})
# ~1,300 icons at ~1 KB each: the whole set fits.
_CACHE_ENTRIES: Final = 4096


def icon_key(build: str, file_name: str) -> str | None:
    """The storage key for ``/wow/icons/{build}/{file_name}``, or None if either part is malformed."""
    match = _FILE_NAME.match(file_name)
    if not match or not _BUILD.match(build):
        return None
    return f"wow/{build}/icons/{int(match.group(1))}.webp"


@lru_cache(maxsize=_CACHE_ENTRIES)
def _cached_download(key: str) -> bytes:
    return get_storage().download_file(key)


def _read(key: str) -> bytes | None:
    try:
        return _cached_download(key)
    except S3Error as exc:
        if exc.code in _MISSING_CODES:
            return None
        logger.warning("WoW icon read failed: key=%s code=%s message=%s", key, exc.code, exc.message)
        raise


async def icon_bytes(build: str, file_name: str) -> bytes | None:
    """The icon's WebP bytes; None when the name is malformed or the icon isn't published."""
    key = icon_key(build, file_name)
    if key is None:
        return None
    return await run_in_threadpool(_read, key)
