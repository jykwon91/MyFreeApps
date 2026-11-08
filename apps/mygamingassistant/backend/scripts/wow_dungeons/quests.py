"""Each dungeon's quests, for the dungeon pages' Quests section.

Classic facts come from cmangos classic-db (GPL-3.0): the quest (``quest_template``:
levels, races, classes, objectives, rewards, the quest before it), who gives
it (``*_questrelation``; a giver out in the world is placed the way the World
Map places it, from ``classicQuests.json``) and who takes it back
(``*_involvedrelation``). A quest is kept only when the WoW Forever client has
it (``QuestV2``), and a reward only when Forever has the item (``items.json``).

Where the operator's own client has seen the quest (``quest_cache.py``), its
title, levels, objectives and rewards are written separately, so the page can
prefer them and tag them "Seen in game".
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field

from scripts.wow_dungeons.quest_cache import (
    OBJECTIVE_GAME_OBJECT,
    OBJECTIVE_ITEM,
    OBJECTIVE_MONSTER,
    CachedQuest,
    QuestCache,
)
from scripts.wow_item_pages.loot_chances import Row, as_int
from scripts.wow_world_map.quests import quest_classes, quest_side

QUEST_COLUMNS = ["id", "title", "level", "minLevel", "side", "classes", "givers", "chain", "objectives", "rewards", "choices", "enders"]
GIVER_COLUMNS = ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"]
OBJECTIVE_COLUMNS = ["kind", "id", "count"]
TARGET_COLUMNS = ["name", "instance"]
SEEN_COLUMNS = ["title", "level", "minLevel", "objectives", "rewards", "choices"]

# The World Map's giver rows say "npc" / "object" too (``scripts/wow_world_map/quests.py``).
KIND_NPC, KIND_OBJECT, KIND_ITEM = "npc", "object", "item"
CACHE_KINDS = {OBJECTIVE_MONSTER: KIND_NPC, OBJECTIVE_ITEM: KIND_ITEM, OBJECTIVE_GAME_OBJECT: KIND_OBJECT}
MAX_GIVERS = 3
# A chain longer than this is a loop in the data, not a quest line.
MAX_CHAIN = 15
OBJECTIVE_SLOTS = range(1, 5)
REWARD_SLOTS = range(1, 5)
CHOICE_SLOTS = range(1, 7)

Objective = tuple[str, int, int]
ItemCount = tuple[int, int]
# [kind, id, name, zone, subzone, x, y, instance] — GIVER_COLUMNS.
Giver = list[object]


def target_key(kind: str, entry: int) -> str:
    """``npc:3636`` — how objectives and enders name what they point at."""
    return f"{kind}:{entry}"


def shown_level(level: int, min_level: int) -> int:
    """QuestLevel -1 = "your level": show it at the level you can take it."""
    return level if level > 0 else min_level


def classic_objectives(quest: Row) -> list[Objective]:
    """Kill / use first, then collect — the order Classic lists them in."""
    out: list[Objective] = []
    for i in OBJECTIVE_SLOTS:
        target, count = as_int(quest[f"ReqCreatureOrGOId{i}"]), as_int(quest[f"ReqCreatureOrGOCount{i}"])
        if target > 0:
            out.append((KIND_NPC, target, count))
        elif target < 0:
            out.append((KIND_OBJECT, -target, count))
    for i in OBJECTIVE_SLOTS:
        item, count = as_int(quest[f"ReqItemId{i}"]), as_int(quest[f"ReqItemCount{i}"])
        if item > 0:
            out.append((KIND_ITEM, item, count))
    return out


def cached_objectives(quest: CachedQuest) -> list[Objective]:
    """The client's objectives the page can name (kill, collect, use); others are left out."""
    return [(CACHE_KINDS[kind], obj, amount) for kind, obj, amount in quest.objectives if kind in CACHE_KINDS]


def classic_items(quest: Row, id_column: str, count_column: str, slots: range, keep: set[int]) -> list[ItemCount]:
    """Reward items (``RewItemId1``.. / ``RewChoiceItemId1``..) Forever has."""
    rows = [(as_int(quest[f"{id_column}{i}"]), as_int(quest[f"{count_column}{i}"])) for i in slots]
    return [r for r in rows if r[0] in keep]


def predecessors(quests: Mapping[int, Row]) -> dict[int, list[int]]:
    """Per quest, the quests that open it, most direct first.

    ``NextQuestInChain`` (the chain the client shows), then the quest's own
    ``PrevQuestId``, then quests whose ``NextQuestId`` opens it. A negative id
    means "while that one is in your log" — a side step, not the way in.
    """
    in_chain: dict[int, list[int]] = defaultdict(list)
    opens: dict[int, list[int]] = defaultdict(list)
    for qid, q in sorted(quests.items()):
        if as_int(q["NextQuestInChain"]) > 0:
            in_chain[as_int(q["NextQuestInChain"])].append(qid)
        if as_int(q["NextQuestId"]) > 0:
            opens[as_int(q["NextQuestId"])].append(qid)
    out: dict[int, list[int]] = {}
    for qid, q in quests.items():
        prev = as_int(q["PrevQuestId"])
        ordered = in_chain.get(qid, []) + ([prev] if prev > 0 else []) + opens.get(qid, [])
        out[qid] = list(dict.fromkeys(p for p in ordered if p != qid))
    return out


def _same_players(a: str, b: str) -> bool:
    return a == b or "N" in (a, b)


def chain_before(quest_id: int, before: Mapping[int, list[int]], keep: Mapping[int, str]) -> list[int]:
    """The quests you do before this one, earliest first.

    ``keep`` is the side each Forever quest is for: a step must exist in Forever
    and suit the same players (Alliance, Horde, or both).
    """
    side = keep[quest_id]
    chain: list[int] = []
    seen = {quest_id}
    current = quest_id
    while len(chain) < MAX_CHAIN:
        step = next((p for p in before.get(current, []) if p in keep and p not in seen and _same_players(keep[p], side)), None)
        if step is None:
            break
        chain.append(step)
        seen.add(step)
        current = step
    return chain[::-1]


def select_quests(
    quests: Mapping[int, Row],
    areas: Mapping[int, int],
    inside: Mapping[str, int],
    keep: Mapping[int, str],
) -> dict[int, list[int]]:
    """Instance map id -> the Forever quests for that dungeon.

    Filed under one of the dungeon's areas, or with an objective that only
    happens inside it (``inside``: target key -> instance).
    """
    found: dict[int, set[int]] = defaultdict(set)
    for qid, q in quests.items():
        if qid not in keep:
            continue
        instance = areas.get(as_int(q["ZoneOrSort"]))
        if instance is not None:
            found[instance].add(qid)
        for kind, entry, _ in classic_objectives(q):
            on = inside.get(target_key(kind, entry))
            if on is not None:
                found[on].add(qid)
    return {m: sorted(ids) for m, ids in found.items()}


@dataclass(frozen=True)
class QuestSources:
    """The cmangos and World Map facts the rows are built from."""

    quests: Mapping[int, Row]
    # quest -> World Map giver rows (out in the world, placed on a zone)
    world_givers: Mapping[int, list[list[object]]]
    # quest -> (kind, entry) of the creatures / objects that give it or take it back
    offered_by: Mapping[int, list[tuple[str, int]]]
    ended_by: Mapping[int, list[tuple[str, int]]]
    # quest -> the items that start it
    started_by: Mapping[int, list[int]]
    # target key -> its Classic name / the dungeon it's only found in
    names: Mapping[str, str]
    inside: Mapping[str, int]
    forever_items: set[int]


@dataclass(frozen=True)
class QuestRow:
    quest_id: int
    title: str
    level: int
    min_level: int
    side: str
    classes: str
    givers: list[Giver]
    chain: list[int]
    objectives: list[Objective]
    rewards: list[ItemCount]
    choices: list[ItemCount]
    enders: list[str]

    def as_json(self) -> list[object]:
        """``QUEST_COLUMNS`` order."""
        return [
            self.quest_id, self.title, self.level, self.min_level, self.side, self.classes, self.givers, self.chain,
            [list(o) for o in self.objectives], [list(r) for r in self.rewards], [list(c) for c in self.choices], self.enders,
        ]

    def repeat_key(self) -> tuple[object, ...]:
        """Everything a player sees but the levels and chain: two quests alike in these are one
        quest offered again (givers by name — Gnomeregan has three Sparklematic 5200 objects)."""
        return (self.title, self.side, self.classes, tuple(str(g[2]) for g in self.givers), tuple(self.objectives),
                tuple(self.rewards), tuple(self.choices))


@dataclass(frozen=True)
class SeenRow:
    title: str
    level: int
    min_level: int
    objectives: list[Objective]
    rewards: list[ItemCount]
    choices: list[ItemCount]

    def as_json(self) -> list[object]:
        """``SEEN_COLUMNS`` order."""
        return [self.title, self.level, self.min_level, [list(o) for o in self.objectives],
                [list(r) for r in self.rewards], [list(c) for c in self.choices]]


def _givers(qid: int, src: QuestSources) -> list[Giver]:
    rows: list[Giver] = []
    for giver_type, entry, name, zone, subzone, x, y in (r[1:8] for r in src.world_givers.get(qid, [])):
        rows.append([giver_type, entry, name, zone, subzone, x, y, None])
    placed = {(r[0], r[1]) for r in rows}
    for kind, entry in src.offered_by.get(qid, []):
        key = target_key(kind, entry)
        if (kind, entry) not in placed and key in src.inside and key in src.names:
            rows.append([kind, entry, src.names[key], None, "", None, None, src.inside[key]])
    for item in src.started_by.get(qid, []):
        key = target_key(KIND_ITEM, item)
        if key in src.names:
            rows.append([KIND_ITEM, item, src.names[key], None, "", None, None, src.inside.get(key)])
    by_name: dict[str, Giver] = {}
    for row in rows:
        by_name.setdefault(str(row[2]), row)
    return list(by_name.values())[:MAX_GIVERS]


def quest_row(qid: int, side: str, chain: list[int], src: QuestSources) -> QuestRow:
    q = src.quests[qid]
    enders = [target_key(kind, entry) for kind, entry in src.ended_by.get(qid, []) if target_key(kind, entry) in src.names]
    return QuestRow(
        quest_id=qid,
        title=str(q["Title"]),
        level=shown_level(as_int(q["QuestLevel"]), as_int(q["MinLevel"])),
        min_level=as_int(q["MinLevel"]),
        side=side,
        classes=quest_classes(as_int(q["RequiredClasses"])),
        givers=_givers(qid, src),
        chain=chain,
        objectives=[o for o in classic_objectives(q) if target_key(o[0], o[1]) in src.names],
        rewards=classic_items(q, "RewItemId", "RewItemCount", REWARD_SLOTS, src.forever_items),
        choices=classic_items(q, "RewChoiceItemId", "RewChoiceItemCount", CHOICE_SLOTS, src.forever_items),
        enders=enders[:MAX_GIVERS],
    )


def seen_row(quest: CachedQuest, src: QuestSources) -> SeenRow:
    """What the operator's client says about a quest."""
    return SeenRow(
        title=quest.title,
        level=shown_level(quest.level, quest.min_level),
        min_level=quest.min_level,
        objectives=[o for o in cached_objectives(quest) if target_key(o[0], o[1]) in src.names],
        rewards=[r for r in quest.rewards if r[0] in src.forever_items],
        choices=[c for c in quest.choices if c[0] in src.forever_items],
    )


def distinct_quests(ids: list[int], rows: Mapping[int, QuestRow]) -> list[int]:
    """Drop repeats — the same quest offered again under another id (Gnomeregan's
    Sparklematic takes each ring as its own quest); the lowest id stays."""
    kept: dict[tuple[object, ...], int] = {}
    for qid in sorted(ids):
        kept.setdefault(rows[qid].repeat_key(), qid)
    first = set(kept.values())
    return [q for q in ids if q in first]


def chain_ends(ids: list[int], rows: Mapping[int, QuestRow]) -> list[int]:
    """Drop a quest another listed quest leads on from — it's shown as a step in that quest's chain."""
    steps = {c for q in ids for c in rows[q].chain}
    return [q for q in ids if q not in steps]


@dataclass(frozen=True)
class DungeonQuests:
    instances: dict[str, list[int]]
    quests: dict[str, list[object]]
    targets: dict[str, list[object]]
    seen: dict[str, list[object]]
    # Every reward item the pages name, Classic and seen.
    item_ids: frozenset[int]


def build_dungeon_quests(src: QuestSources, areas: Mapping[int, int], keep: Mapping[int, str], cache: QuestCache) -> DungeonQuests:
    """Every dungeon's quests and the quests before them, the names they point at, and the seen overlay."""
    before = predecessors(src.quests)
    rows: dict[int, QuestRow] = {}
    instances: dict[str, list[int]] = {}
    for instance, ids in sorted(select_quests(src.quests, areas, src.inside, keep).items()):
        for qid in ids:
            rows.setdefault(qid, quest_row(qid, keep[qid], chain_before(qid, before, keep), src))
        shown = chain_ends(distinct_quests(ids, rows), rows)
        instances[str(instance)] = sorted(shown, key=lambda q: (rows[q].level, rows[q].title, q))
    listed = {q for ids in instances.values() for q in ids}
    for step in sorted({c for q in listed for c in rows[q].chain}):
        rows.setdefault(step, quest_row(step, keep[step], chain_before(step, before, keep), src))
    used = listed | {c for q in listed for c in rows[q].chain}
    unreadable = sorted(cache.unreadable & used)
    if unreadable:
        raise SystemExit(f"The quest cache has dungeon quests this reader can't read: {unreadable}. Fix quest_cache.py.")
    seen = {q: seen_row(cache.quests[q], src) for q in sorted(used) if q in cache.quests}
    shown_rows = [rows[q] for q in sorted(used)]
    keys = {target_key(k, e) for r in shown_rows for k, e, _ in r.objectives} | {k for r in shown_rows for k in r.enders}
    keys |= {target_key(k, e) for s in seen.values() for k, e, _ in s.objectives}
    items = {i for r in shown_rows for i, _ in (*r.rewards, *r.choices)} | {i for s in seen.values() for i, _ in (*s.rewards, *s.choices)}
    return DungeonQuests(
        instances=instances,
        quests={str(r.quest_id): r.as_json() for r in shown_rows},
        targets={k: [src.names[k], src.inside.get(k)] for k in sorted(keys)},
        seen={str(q): s.as_json() for q, s in seen.items()},
        item_ids=frozenset(items),
    )
