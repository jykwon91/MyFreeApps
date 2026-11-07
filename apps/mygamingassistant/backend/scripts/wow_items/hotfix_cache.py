"""Read the game client's hotfix cache, ``Cache/ADB/<locale>/DBCache.bin``.

The client writes every table record the server sends it into this file: the
hotfix pushes it gets at login, and the records it asks for on demand — the
Forever client file leaves most items out, so the client asks the server for
each one the first time it sees it (in a bag, on a vendor, in a loot window).

Format (``XFTH`` version 9; https://wowdev.wiki/DBCache.bin)::

    header: magic "XFTH", u32 version, u32 client build, 32-byte hash
    entry:  magic "XFTH", i32 region, i32 push id, u32 unique id,
            u32 table hash, u32 record id, u32 data size, u8 status, 3 pad,
            then ``data size`` bytes of record

The record bytes are the table's fields in WoWDBDefs layout order, strings
inline (see ``dbd.py``). Read-only: this module only ever gets bytes.
"""
from __future__ import annotations

import struct
from collections.abc import Iterable
from dataclasses import dataclass

MAGIC = b"XFTH"
SUPPORTED_VERSION = 9
HEADER = struct.Struct("<4sII32s")
ENTRY = struct.Struct("<4siiIIIIB3x")

# Entry status. Only these two carry an answer about the record; "invalid" and
# "not public" entries say the server had nothing to send, so the client keeps
# what its own file says.
STATUS_VALID = 1
STATUS_RECORD_REMOVED = 2


class HotfixCacheError(ValueError):
    """The file isn't a hotfix cache this reader understands."""


@dataclass(frozen=True)
class HotfixEntry:
    region_id: int
    push_id: int
    unique_id: int
    table_hash: int
    record_id: int
    status: int
    data: bytes


@dataclass(frozen=True)
class HotfixCache:
    version: int
    build: int
    entries: tuple[HotfixEntry, ...]


def parse_hotfix_cache(blob: bytes) -> HotfixCache:
    if len(blob) < HEADER.size:
        raise HotfixCacheError("file is shorter than the hotfix cache header")
    magic, version, build, _hash = HEADER.unpack_from(blob, 0)
    if magic != MAGIC:
        raise HotfixCacheError(f"not a hotfix cache (magic {magic!r})")
    if version != SUPPORTED_VERSION:
        raise HotfixCacheError(f"hotfix cache version {version}; this reader knows {SUPPORTED_VERSION}")
    entries = []
    offset = HEADER.size
    while offset < len(blob):
        if offset + ENTRY.size > len(blob):
            raise HotfixCacheError(f"truncated entry header at byte {offset}")
        magic, region, push, unique, table_hash, record_id, size, status = ENTRY.unpack_from(blob, offset)
        if magic != MAGIC:
            raise HotfixCacheError(f"bad entry magic {magic!r} at byte {offset}")
        start = offset + ENTRY.size
        end = start + size
        if end > len(blob):
            raise HotfixCacheError(f"truncated entry data at byte {offset} (record {record_id})")
        entries.append(HotfixEntry(region, push, unique, table_hash, record_id, status, blob[start:end]))
        offset = end
    return HotfixCache(version, build, tuple(entries))


def latest_records(entries: Iterable[HotfixEntry], table_hash: int) -> dict[int, bytes | None]:
    """Each record of one table as the newest entry about it left it.

    The value is the record's bytes, or None when the server removed it.
    Entries that carry no answer are skipped. "Newest" is the highest push id:
    on-demand replies use ``0x1000000 + record id``, above every real push, and
    are the server's current answer.
    """
    newest: dict[int, HotfixEntry] = {}
    for entry in entries:
        if entry.table_hash != table_hash or entry.status not in (STATUS_VALID, STATUS_RECORD_REMOVED):
            continue
        seen = newest.get(entry.record_id)
        if seen is None or entry.push_id >= seen.push_id:
            newest[entry.record_id] = entry
    return {
        record_id: entry.data if entry.status == STATUS_VALID else None
        for record_id, entry in newest.items()
    }
