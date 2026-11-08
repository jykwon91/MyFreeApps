"""Read the game client's quest cache, ``Cache/WDB/<locale>/questcache.wdb``.

The client writes the quest record the server sends it each time it looks at a
quest (from a quest giver, the quest log or a quest link), so the cache holds
what WoW Forever itself says about every quest the operator has seen: its
title, levels, objectives and rewards. The file is read at generate time and
never committed; only the facts the dungeon pages show are kept.

Format (worked out against the cmangos values of the same quests)::

    header: magic "TSQW", u32 client build, 4-byte locale ("SUne"), 3 × u32
    record: u32 quest id, u32 size, then ``size`` bytes, until a 0 / 0 pair

    record body, little-endian:
      i32 [0] id, [2] level (-1 = your level), [4] required level,
          [24] item that starts it, [29 + 4k] reward item k (k < 4) with its
          count at [30 + 4k], [45 + 3k] choice item k (k < 6) with its count
          at [46 + 3k], [109] objective count
      byte 488: each objective — i32 id, i32 type, u8 index, i32 object id,
          i32 amount, …, i32 visual-effect count at +33, the effects (4 bytes
          each) from +41, then two bit-packed bytes whose first 8 bits are the
          length of the objective's own text, then that text
      then the bit-packed lengths of the quest's strings (title: 9 bits, …)
      and the strings, title first.

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

QUEST_CACHE_ENV = "WOW_FOREVER_QUEST_CACHE"
DEFAULT_QUEST_CACHE = Path(r"D:\World of Warcraft\_forever_\Cache\WDB\enUS\questcache.wdb")

MAGIC = b"TSQW"
HEADER_SIZE = 24
RECORD_HEAD = struct.Struct("<II")
FIXED_INTS = 122
OBJECTIVES_AT = FIXED_INTS * 4
AT_LEVEL, AT_MIN_LEVEL, AT_OBJECTIVE_COUNT = 2, 4, 109
REWARD_ITEMS = [(29 + 4 * k, 30 + 4 * k) for k in range(4)]
CHOICE_ITEMS = [(45 + 3 * k, 46 + 3 * k) for k in range(6)]
OBJECTIVE_HEAD = struct.Struct("<iiBii")
OBJECTIVE_EFFECT_COUNT_AT = 33
OBJECTIVE_EFFECTS_AT = 41
OBJECTIVE_TEXT_BITS = 2
# The quest strings' lengths, in bits, in order (title first).
STRING_LENGTH_BITS = (9, 12, 12, 9, 10, 8, 10, 8, 11, 1)
STRING_LENGTH_BYTES = (sum(STRING_LENGTH_BITS) + 7) // 8
# QuestObjective types the dungeon pages show.
OBJECTIVE_MONSTER, OBJECTIVE_ITEM, OBJECTIVE_GAME_OBJECT = 0, 1, 2


class QuestCacheError(ValueError):
    """The file isn't a quest cache this reader understands."""


@dataclass(frozen=True)
class CachedQuest:
    quest_id: int
    title: str
    level: int
    min_level: int
    # (type, object id, amount), in the client's order.
    objectives: tuple[tuple[int, int, int], ...]
    rewards: tuple[tuple[int, int], ...]
    choices: tuple[tuple[int, int], ...]


@dataclass(frozen=True)
class QuestCache:
    build: int
    quests: dict[int, CachedQuest]
    # Records in a shape this reader doesn't know (Forever's own profession
    # writs carry extra objective data). The build stops if a dungeon quest is one.
    unreadable: frozenset[int]


def _bits(buf: bytes, widths: tuple[int, ...]) -> list[int]:
    """Big-endian bit fields, the way the client packs string lengths."""
    if len(buf) * 8 < sum(widths):
        raise QuestCacheError(f"record ends inside its bit-packed lengths ({len(buf)} bytes left)")
    value = int.from_bytes(buf, "big")
    left = len(buf) * 8
    out = []
    for width in widths:
        left -= width
        out.append((value >> left) & ((1 << width) - 1))
    return out


def _items(ints: tuple[int, ...], slots: list[tuple[int, int]]) -> tuple[tuple[int, int], ...]:
    return tuple((ints[i], ints[c]) for i, c in slots if ints[i] > 0)


def parse_quest(body: bytes) -> CachedQuest:
    if len(body) < OBJECTIVES_AT:
        raise QuestCacheError(f"quest record of {len(body)} bytes is too short")
    ints = struct.unpack_from(f"<{FIXED_INTS}i", body, 0)
    at = OBJECTIVES_AT
    objectives = []
    for _ in range(ints[AT_OBJECTIVE_COUNT]):
        _, kind, _, object_id, amount = OBJECTIVE_HEAD.unpack_from(body, at)
        (effects,) = struct.unpack_from("<i", body, at + OBJECTIVE_EFFECT_COUNT_AT)
        at += OBJECTIVE_EFFECTS_AT + 4 * effects
        (text_length,) = _bits(body[at:at + OBJECTIVE_TEXT_BITS], (8,))
        at += OBJECTIVE_TEXT_BITS + text_length
        objectives.append((kind, object_id, amount))
    lengths = _bits(body[at:at + STRING_LENGTH_BYTES], STRING_LENGTH_BITS)
    at += STRING_LENGTH_BYTES
    if at + sum(lengths[:-1]) != len(body):
        raise QuestCacheError(f"quest {ints[0]}: strings don't end where the record does")
    return CachedQuest(
        quest_id=ints[0],
        title=body[at:at + lengths[0]].decode("utf-8"),
        level=ints[AT_LEVEL],
        min_level=ints[AT_MIN_LEVEL],
        objectives=tuple(objectives),
        rewards=_items(ints, REWARD_ITEMS),
        choices=_items(ints, CHOICE_ITEMS),
    )


def parse_quest_cache(data: bytes) -> QuestCache:
    if data[:4] != MAGIC:
        raise QuestCacheError(f"not a quest cache (magic {data[:4]!r})")
    (build,) = struct.unpack_from("<I", data, 4)
    quests: dict[int, CachedQuest] = {}
    unreadable: set[int] = set()
    at = HEADER_SIZE
    while at + RECORD_HEAD.size <= len(data):
        quest_id, size = RECORD_HEAD.unpack_from(data, at)
        if quest_id == 0 and size == 0:
            break
        body = data[at + RECORD_HEAD.size:at + RECORD_HEAD.size + size]
        at += RECORD_HEAD.size + size
        try:
            quest = parse_quest(body)
        except (QuestCacheError, struct.error, UnicodeDecodeError):
            unreadable.add(quest_id)
            continue
        if quest.quest_id != quest_id:
            unreadable.add(quest_id)
            continue
        quests[quest_id] = quest
    return QuestCache(build=build, quests=quests, unreadable=frozenset(unreadable))


def quest_cache_path(cli_value: str | None) -> Path:
    """The client cache to read: ``--quest-cache``, else the env var, else the operator's install."""
    path = Path(cli_value or os.environ.get(QUEST_CACHE_ENV) or DEFAULT_QUEST_CACHE)
    if not path.is_file():
        raise SystemExit(
            f"WoW Forever quest cache not found at {path}.\n"
            "The dungeon pages' \"Seen in game\" quest facts come from this file, so a run without it\n"
            "would drop them. Point at the client's _forever_/Cache/WDB/enUS/questcache.wdb with\n"
            f"--quest-cache <path> or {QUEST_CACHE_ENV}=<path>."
        )
    return path


def read_quest_cache(path: Path) -> tuple[QuestCache, str]:
    """Parse a copy of the cache (the game's own file is only ever read), and the day it was last written."""
    copy = CACHE_DIR / "client-quests" / "questcache.wdb"
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, copy)
    seen_on = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).date().isoformat()
    return parse_quest_cache(copy.read_bytes()), seen_on
