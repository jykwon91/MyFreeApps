"""Read the game client's creature cache, ``Cache/WDB/<locale>/creaturecache.wdb``.

The WoW Forever client file ships almost no creatures (its ``Creature`` table
has under 200 rows, all classification 0): the server sends each creature's
record the first time the client meets it, and the client keeps the answer in
this file. So the cache is the one place the Forever client says what a
creature is called and whether it is a rare. It is read at generate time and
never committed; only names and classifications are kept.

Format (worked out against the cmangos values of the same creatures — the
classification agrees with ``creature_template.Rank`` for all but a handful
that Forever renamed or re-ranked)::

    header: magic "BOMW", u32 client build, 4-byte locale ("SUne"), 3 × u32
    record: u32 creature id, u32 size, then ``size`` bytes, until a 0 / 0 pair

    record body: a 15-byte bit-packed header (MSB first) — title length (11
    bits), alternate title (11), cursor name (6), a leader flag (1), then the
    lengths of four name / alternate-name pairs (11 bits each; a length counts
    the string's closing NUL) — then those name strings, back to back, then
    the fixed fields: the classification is the byte 17 bytes after the last
    name (0 normal, 1 elite, 2 rare elite, 3 boss, 4 rare).

Read-only: this module only ever gets bytes.
"""
from __future__ import annotations

import os
import shutil
import struct
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from scripts.wow_world_map.sources import CACHE_DIR

CREATURE_CACHE_ENV = "WOW_FOREVER_CREATURE_CACHE"
DEFAULT_CREATURE_CACHE = Path(r"D:\World of Warcraft\_forever_\Cache\WDB\enUS\creaturecache.wdb")

MAGIC = b"BOMW"
HEADER = struct.Struct("<4sI4sIII")
RECORD_HEAD = struct.Struct("<II")
BIT_HEADER_BYTES = 15
# Title (11) + alternate title (11) + cursor name (6) + leader flag (1) come before the names.
NAMES_AT_BIT = 29
NAME_LENGTH_BITS = 11
NAME_SLOTS = 8
CLASSIFICATION_AFTER_NAMES = 17

CLASSIFICATION_NORMAL = 0
CLASSIFICATION_ELITE = 1
CLASSIFICATION_RARE_ELITE = 2
CLASSIFICATION_BOSS = 3
CLASSIFICATION_RARE = 4


class CreatureCacheError(ValueError):
    """The file isn't a creature cache this reader understands."""


@dataclass(frozen=True)
class CachedCreature:
    creature_id: int
    name: str
    classification: int


@dataclass(frozen=True)
class CreatureCache:
    build: int
    creatures: dict[int, CachedCreature]


def _bits(data: bytes, start: int, width: int) -> int:
    value = 0
    for i in range(start, start + width):
        value = (value << 1) | ((data[i // 8] >> (7 - i % 8)) & 1)
    return value


def parse_creature(creature_id: int, body: bytes) -> CachedCreature:
    if len(body) < BIT_HEADER_BYTES:
        raise CreatureCacheError(f"creature {creature_id}: record is shorter than its header")
    lengths = [_bits(body, NAMES_AT_BIT + NAME_LENGTH_BITS * k, NAME_LENGTH_BITS) for k in range(NAME_SLOTS)]
    names_end = BIT_HEADER_BYTES + sum(lengths)
    at = names_end + CLASSIFICATION_AFTER_NAMES
    if lengths[0] == 0 or at >= len(body):
        raise CreatureCacheError(f"creature {creature_id}: record has no name or is cut short")
    name = body[BIT_HEADER_BYTES:BIT_HEADER_BYTES + lengths[0] - 1].decode("utf-8")
    return CachedCreature(creature_id, name, body[at])


def parse_creature_cache(data: bytes) -> CreatureCache:
    if len(data) < HEADER.size:
        raise CreatureCacheError("file is shorter than the creature cache header")
    magic, build, _locale, _a, _b, _c = HEADER.unpack_from(data, 0)
    if magic != MAGIC:
        raise CreatureCacheError(f"not a creature cache (magic {magic!r})")
    creatures: dict[int, CachedCreature] = {}
    offset = HEADER.size
    while offset + RECORD_HEAD.size <= len(data):
        creature_id, size = RECORD_HEAD.unpack_from(data, offset)
        if creature_id == 0 and size == 0:
            break
        start = offset + RECORD_HEAD.size
        if start + size > len(data):
            raise CreatureCacheError(f"creature {creature_id}: record runs past the end of the file")
        creatures[creature_id] = parse_creature(creature_id, data[start:start + size])
        offset = start + size
    return CreatureCache(build=build, creatures=creatures)


def creature_cache_path(cli_value: str | None) -> Path:
    """The client cache to read: ``--creature-cache``, else the env var, else the operator's install."""
    path = Path(cli_value or os.environ.get(CREATURE_CACHE_ENV) or DEFAULT_CREATURE_CACHE)
    if not path.is_file():
        raise SystemExit(
            f"WoW Forever creature cache not found at {path}.\n"
            "The Forever client file has almost no creatures, so this cache is the only Forever source of\n"
            "which creatures are rares — a run without it would list none. Point at the client's\n"
            "_forever_/Cache/WDB/enUS/creaturecache.wdb with --creature-cache <path> or "
            f"{CREATURE_CACHE_ENV}=<path>."
        )
    return path


def read_creature_cache(path: Path) -> tuple[CreatureCache, str]:
    """Parse a copy of the cache (the game's own file is only ever read), and the day it was last written."""
    copy = CACHE_DIR / "client-creatures" / "creaturecache.wdb"
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, copy)
    seen_on = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).date().isoformat()
    return parse_creature_cache(copy.read_bytes()), seen_on
