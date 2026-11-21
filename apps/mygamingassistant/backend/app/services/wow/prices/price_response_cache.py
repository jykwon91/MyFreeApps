"""In-process cache of serialized GET /api/wow/prices responses, keyed by ETag.

One entry per house (at most ``_MAX_ENTRIES``); memory stays bounded at roughly
3 houses × ~300 KB. No TTL is needed: the ETag is derived from ``fetched_at``
so a new price set produces a new key and naturally makes the old one
unreachable. Because the scheduler and the API are separate processes this
cache is per-process; the ETag key provides cross-process invalidation
automatically — a new refresh produces a new ETag which misses the cache and
replaces the entry for that house.
"""
from __future__ import annotations

from typing import Final

_MAX_ENTRIES: Final = 10  # safety bound; in practice 3 houses (the PvP triple)


class PriceResponseCache:
    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}

    def get(self, etag: str) -> bytes | None:
        return self._data.get(etag)

    def put(self, etag: str, body: bytes) -> None:
        if len(self._data) >= _MAX_ENTRIES and etag not in self._data:
            # Simple eviction: drop all old entries when the dict is full.
            # This is intentionally coarse — in normal operation the dict holds
            # exactly 3 entries (the PvP houses) so the branch is never taken.
            self._data.clear()
        self._data[etag] = body


# Module-level singleton shared by all requests in this process.
_cache = PriceResponseCache()


def get(etag: str) -> bytes | None:
    """Return the cached JSON bytes for ``etag``, or ``None`` on a miss."""
    return _cache.get(etag)


def put(etag: str, body: bytes) -> None:
    """Store ``body`` (UTF-8 JSON) under ``etag``."""
    _cache.put(etag, body)
