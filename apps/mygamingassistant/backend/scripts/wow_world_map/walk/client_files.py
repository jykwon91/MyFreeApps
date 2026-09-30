"""Raw Forever client files (terrain, buildings, models) by FileDataID.

wago.tools serves each file of a pinned client build from its CASC archive;
downloads are cached next to the DB2 tables (see ``sources.py``). A map needs
a few thousand files, so :func:`prefetch` downloads them on a small thread
pool — kept small to be polite to a free community service.
"""
from __future__ import annotations

import struct
import time
import urllib.error
from collections.abc import Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor

from scripts.wow_world_map import sources

DOWNLOAD_THREADS = 6
RETRIES = 5


def _url(file_data_id: int) -> str:
    return (
        f"https://wago.tools/api/casc/{file_data_id}"
        f"?download&branch={sources.WAGO_BRANCH}&build={sources.WAGO_BUILD}"
    )


def client_file(file_data_id: int) -> bytes:
    """A client file's bytes; a dropped connection is retried with back-off
    (a continent is thousands of downloads), an HTTP error is not."""
    path = sources.CACHE_DIR / sources.WAGO_BUILD / "files" / f"{file_data_id}.bin"
    for attempt in range(RETRIES):
        try:
            return sources._fetch(_url(file_data_id), path).read_bytes()
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
            if attempt == RETRIES - 1:
                raise
            print(f"  file {file_data_id}: {exc} — retrying")
            time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def prefetch(file_data_ids: Iterable[int]) -> None:
    ids = sorted({f for f in file_data_ids if f})
    with ThreadPoolExecutor(DOWNLOAD_THREADS) as pool:
        for _ in pool.map(client_file, ids):
            pass


def chunks(data: bytes) -> Iterator[tuple[str, bytes]]:
    """The ``(tag, payload)`` chunks of an IFF-style client file, in order.

    Tags are stored byte-reversed (``REVM`` for ``MVER``)."""
    offset = 0
    while offset + 8 <= len(data):
        tag = data[offset:offset + 4][::-1].decode("latin-1")
        (size,) = struct.unpack_from("<I", data, offset + 4)
        yield tag, data[offset + 8:offset + 8 + size]
        offset += 8 + size


def chunk_map(data: bytes) -> dict[str, bytes]:
    """First chunk of each tag — for files where every tag appears once."""
    out: dict[str, bytes] = {}
    for tag, payload in chunks(data):
        out.setdefault(tag, payload)
    return out
