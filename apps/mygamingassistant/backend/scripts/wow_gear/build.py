"""Build the WoW Forever "Best gear" source data.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_gear.build

Run after the World Map, Professions and Item generators: it reads their
committed output (``classicDungeons.json``, ``classicQuests.json``, the
crafting recipe JSON and ``items.json``).

Writes two files, kept apart because their licences differ:

* ``data/gear/gearFacts.json`` — from the Forever client (wago.tools): which
  items a profession crafts (and at what skill), which need a profession or a
  reputation to use, which are PvP gear, which the client flags deprecated,
  and which ids also sit in the Classic Era client (Season of Discovery
  leftovers, not Forever rewards).
  The Forever client has NO Encounter Journal tables (``JournalEncounterItem``
  / ``JournalEncounter`` / ``JournalInstance`` are "Table not found" on
  wago.tools for 1.60.1.70790), so it gives no boss loot.
* ``data/gear/classic/gearSources.json`` — cmangos classic-db (GPL-3.0, LICENSE
  + README next to it): quest rewards and dungeon-boss drops by Classic item
  id, plus the items only raids or world bosses give (their loot, and quests
  that need something from a raid). Every row is labelled "Classic data, may
  differ" on the page.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
import shutil
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any

from scripts.wow_food.build import CLASSIC_LICENSE, WOW_DATA_DIR
from scripts.wow_gear.loot import (
    MAX_SOURCES_PER_ITEM,
    as_int,
    boss_drops,
    creature_items_by_place,
    creature_maps,
    loot_index,
    table_items,
)
from scripts.wow_gear.raid_gate import quest_reward_ids, raid_gated_quests, raid_given_quests
from scripts.wow_world_map.quests import quest_classes, quest_side
from scripts.wow_world_map.sources import (
    CMANGOS_COMMIT,
    WAGO_BRANCH,
    WAGO_BUILD,
    WAGO_ERA_BRANCH,
    WAGO_ERA_BUILD,
    cmangos_dump,
    wago_table,
)
from scripts.wow_world_map.sql_dump import read_dump

DATA_DIR = WOW_DATA_DIR / "gear"
FACTS_PATH = DATA_DIR / "gearFacts.json"
CLASSIC_DIR = DATA_DIR / "classic"
SOURCES_PATH = CLASSIC_DIR / "gearSources.json"
ITEMS_PATH = WOW_DATA_DIR / "items" / "items.json"
CRAFTING_DIR = WOW_DATA_DIR / "professions" / "crafting"
WORLD_MAP_CLASSIC = WOW_DATA_DIR / "worldMap" / "classic"

ATTRIBUTION = "Item data from the WoW Forever client via wago.tools. Game data © Blizzard Entertainment."

# Crafting JSON file stem -> the profession's name on the page.
PROFESSIONS = {
    "alchemy": "Alchemy",
    "blacksmithing": "Blacksmithing",
    "enchanting": "Enchanting",
    "engineering": "Engineering",
    "leatherworking": "Leatherworking",
    "tailoring": "Tailoring",
}

FIRST_FOREVER_ITEM_ID = 100000
BIND_ON_PICKUP = 1
# ItemSparse Flags_0 bit the client sets on items taken out of the game
# (Talisman of Binding Shard, Coral Band, Quicksilver Ring).
ITEM_FLAG_DEPRECATED = 0x10
# Classic battleground reputations (Faction ids): their rewards are PvP gear.
BATTLEGROUND_FACTIONS = frozenset({509, 510, 729, 730, 889, 890})
# Forever's own PvP vendor gear ("Premier Warlord's Felweave Hood", "Premier
# Field Marshal's Dreadweave Coronal") has no PvP rank requirement in the
# client, so the name marks it. Checked on build 1.60.1: every "Premier" item
# that is in a set (359 of 537) is in one of the client's PvP rank sets
# (Champion's / Lieutenant Commander's / Warlord's / Field Marshal's ...).
FOREVER_PVP_PREFIX = "Premier "
# cmangos ``conditions.type``: 5 = a minimum reputation rank (value1 = faction),
# -1 / -2 = all / any of the conditions in value1..value4.
CONDITION_REPUTATION_RANK_MIN = 5
CONDITION_GROUPS = frozenset({-1, -2})
MAX_CONDITION_DEPTH = 4
# Places other than a creature's loot an item can come from. Gathering nodes
# and chests are all counted as outside a raid (cmangos doesn't tie most
# gameobject loot to a map), which only ever makes the raid gate narrower.
OTHER_LOOT_TABLES = (
    "gameobject_loot_template", "skinning_loot_template", "pickpocketing_loot_template",
    "fishing_loot_template", "item_loot_template", "mail_loot_template", "disenchant_loot_template",
)

REPUTATION_RANKS = ("Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted")

CLASSIC_README = """# Best gear — Classic sources

`gearSources.json` says where an item came from in Classic: the quests that
reward it and the dungeon bosses that drop it (with the dungeon's Forever
level from `../../worldMap/classic/classicDungeons.json`), plus the ids only a
raid gives — a raid or world boss drops it, or only a quest that needs
something from a raid rewards it (Plagueheart, Atiesh, the Head of Nefarian),
or a reputation only raids give (Zandalar Tribe, Brood of Nozdormu: the Signet
Rings of the Bronze Dragonflight). Raids open later in Forever, so the page
leaves those out, and quests that need a raid item are not listed as sources.
`pvp` lists gear Classic gated behind a PvP rank or a battleground
reputation (the page hides PvP gear unless asked). It is derived from
[cmangos classic-db](https://github.com/cmangos/classic-db) at commit
`{commit}` (`quest_template`, `item_template`, `creature_template`, `creature`,
`creature_loot_template`, `reference_loot_template`), licensed GPL-3.0 —
see `LICENSE`. No cmangos code is used. Quests are only those the World Map
lists (a placed giver for Alliance or Horde). Forever may differ: the page
labels every row "Classic data, may differ" and never shows drop rates.

Generated by `backend/scripts/wow_gear/build.py`. Never hand-edit.
"""

Row = Mapping[str, Any]


def crafted_items(docs: Mapping[str, Mapping[str, Any]]) -> dict[int, list[Any]]:
    """Item id -> [profession, skill to learn the recipe] from the crafting JSON.

    When several recipes make the item, the lowest skill wins (then the
    profession name, so the output never depends on file order).
    """
    best: dict[int, tuple[int, str]] = {}
    for stem, doc in docs.items():
        profession = PROFESSIONS[stem]
        for recipe in doc.get("recipes", []):
            creates = recipe.get("creates")
            if not creates:
                continue
            learn = recipe.get("learn") or {}
            skill = as_int(learn.get("skill")) or as_int(recipe.get("yellow"))
            key = (skill, profession)
            item_id = as_int(creates["id"])
            if item_id not in best or key < best[item_id]:
                best[item_id] = key
    return {item_id: [profession, skill] for item_id, (skill, profession) in best.items()}


def item_facts(
    sparse_rows: Iterable[Row],
    gear_ids: set[int],
    skill_names: Mapping[int, str],
    faction_names: Mapping[int, str],
) -> dict[str, Any]:
    """Requirements and flags the Forever client sets on each gear item."""
    requires: dict[int, list[Any]] = {}
    reputation: dict[int, list[Any]] = {}
    pvp: dict[int, int] = {}
    bind_on_pickup: dict[int, int] = {}
    deprecated: list[int] = []
    for row in sparse_rows:
        item_id = as_int(row["ID"])
        if item_id not in gear_ids:
            continue
        skill = as_int(row.get("RequiredSkill"))
        if skill > 0 and skill in skill_names:
            requires[item_id] = [skill_names[skill], as_int(row.get("RequiredSkillRank"))]
        faction = as_int(row.get("MinFactionID"))
        if faction > 0 and faction in faction_names:
            rank = min(as_int(row.get("MinReputation")), len(REPUTATION_RANKS) - 1)
            reputation[item_id] = [faction_names[faction], REPUTATION_RANKS[rank]]
        if (
            as_int(row.get("RequiredPVPRank")) > 0
            or faction in BATTLEGROUND_FACTIONS
            or str(row.get("Display_lang") or "").startswith(FOREVER_PVP_PREFIX)
        ):
            pvp[item_id] = 1
        if as_int(row.get("Bonding")) == BIND_ON_PICKUP:
            bind_on_pickup[item_id] = 1
        if as_int(row.get("Flags_0")) & ITEM_FLAG_DEPRECATED:
            deprecated.append(item_id)
    return {
        "requires": requires,
        "reputation": reputation,
        "pvp": pvp,
        "bindOnPickup": bind_on_pickup,
        "deprecated": sorted(deprecated),
    }


def condition_factions(conditions: Mapping[int, Row], entry: int, depth: int = 0) -> set[int]:
    """Factions a cmangos ``conditions`` entry asks a reputation rank of (following AND / OR groups)."""
    row = conditions.get(entry)
    if row is None or depth > MAX_CONDITION_DEPTH:
        return set()
    kind = as_int(row["type"])
    if kind == CONDITION_REPUTATION_RANK_MIN:
        return {as_int(row["value1"])}
    if kind in CONDITION_GROUPS:
        return set().union(*(condition_factions(conditions, as_int(row[f"value{n}"]), depth + 1) for n in range(1, 5)))
    return set()


def classic_pvp_items(
    item_rows: Iterable[Row],
    vendor_rows: Iterable[Row],
    conditions: Mapping[int, Row],
    gear_ids: set[int],
) -> list[int]:
    """Gear Classic gates behind PvP: a PvP rank or battleground reputation on the item, or a
    battleground quartermaster that only sells it at a battleground reputation rank.

    Forever dropped the reputation from some of these (Frostwolf Cloth Belt), and
    the Warsong Gulch rewards (Advisor's Ring, Dryad's Wrist Bindings) only ever
    had it on the vendor, so the Forever client alone misses them.
    """
    pvp = {
        as_int(row["entry"])
        for row in item_rows
        if as_int(row.get("requiredhonorrank")) > 0
        or as_int(row.get("RequiredReputationFaction")) in BATTLEGROUND_FACTIONS
    }
    pvp |= {
        as_int(row["item"])
        for row in vendor_rows
        if condition_factions(conditions, as_int(row.get("condition_id"))) & BATTLEGROUND_FACTIONS
    }
    return sorted(pvp & gear_ids)


def era_leftovers(gear_ids: set[int], era_ids: set[int]) -> list[int]:
    """Gear ids >= 100000 that the Classic Era client also has.

    Ids from 100000 up are new since 1.12. One the Classic Era client also
    ships was added for Season of Discovery (Privateer's Ornate Pistol,
    Personal Spellbook, Infernal Lasso), not for Forever, so no Forever
    source is known to give it.
    """
    return sorted(i for i in gear_ids if i >= FIRST_FOREVER_ITEM_ID and i in era_ids)


def quest_rewards(
    quest_rows: Iterable[Row],
    listed_quests: set[int],
    gear_ids: set[int],
    skip: set[int],
) -> dict[int, list[list[Any]]]:
    """Item id -> [[title, min level, quest level, side, classes], ...] for quests the World Map lists, minus ``skip``."""
    rewards: dict[int, list[list[Any]]] = defaultdict(list)
    for quest in quest_rows:
        quest_id = as_int(quest["entry"])
        side = quest_side(as_int(quest["RequiredRaces"]))
        if quest_id not in listed_quests or quest_id in skip or side is None:
            continue
        min_level = as_int(quest["MinLevel"])
        level = as_int(quest["QuestLevel"])
        if level <= 0:
            level = min_level  # -1 = scales with the player
        row = [str(quest["Title"]), min_level, level, side, quest_classes(as_int(quest["RequiredClasses"]))]
        for item_id in quest_reward_ids(quest) & gear_ids:
            if row not in rewards[item_id]:
                rewards[item_id].append(row)
    return {i: sorted(rows, key=lambda r: (r[1], r[2], r[0], r[3]))[:MAX_SOURCES_PER_ITEM] for i, rows in rewards.items()}


def dungeon_levels(dungeon_doc: Mapping[str, Any]) -> dict[int, list[Any]]:
    """Instance map id -> [name, Forever level, level to enter] from the World Map's dungeon rows.

    Forever tunes a whole instance to one level range: every wing row of an
    instance (Scarlet Monastery, Dire Maul) carries the same levels, so one
    entry per instance loses nothing. Fails if that ever stops being true —
    a boss's levels would then depend on its wing, which the loot data lacks.
    """
    columns = dungeon_doc["columns"]
    at = {c: columns.index(c) for c in ("instance", "name", "type", "maxLevel", "requiredLevel")}
    out: dict[int, list[Any]] = {}
    for row in dungeon_doc["rows"]:
        if row[at["type"]] != "dungeon":
            continue
        map_id = row[at["instance"]]
        entry = [row[at["name"]], row[at["maxLevel"]], row[at["requiredLevel"]]]
        if map_id in out and out[map_id][1:] != entry[1:]:
            raise SystemExit(f"instance {map_id} has wings at different levels: {out[map_id]} vs {entry}")
        out.setdefault(map_id, entry)
    return out


def _keyed(mapping: Mapping[int, Any]) -> dict[str, Any]:
    return {str(k): mapping[k] for k in sorted(mapping)}


def write_json(path: Path, doc: Mapping[str, Any]) -> None:
    """One entry per line inside each top-level map, so a refresh diff names the items that changed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    for key, value in doc.items():
        if isinstance(value, dict) and value and all(k.isdigit() for k in value):
            body = ",\n".join(f"{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in value.items())
            parts.append(f"{json.dumps(key)}:{{\n{body}\n}}")
        else:
            parts.append(f"{json.dumps(key)}:{json.dumps(value, ensure_ascii=False, separators=(',', ':'))}")
    path.write_text("{" + ",\n".join(parts) + "}\n", encoding="utf-8")


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _forever_facts(gear_ids: set[int]) -> dict[int, list[Any]]:
    """Write ``gearFacts.json``; return the crafted items (the Classic half needs them)."""
    crafting = {stem: _load_json(CRAFTING_DIR / f"{stem}.json") for stem in PROFESSIONS}
    crafted = {i: v for i, v in crafted_items(crafting).items() if i in gear_ids}
    skill_names = {as_int(r["ID"]): r["DisplayName_lang"] for r in wago_table("SkillLine") if r.get("DisplayName_lang")}
    faction_names = {as_int(r["ID"]): r["Name_lang"] for r in wago_table("Faction") if r.get("Name_lang")}
    facts = item_facts(wago_table("ItemSparse"), gear_ids, skill_names, faction_names)
    era_ids = {as_int(r["ID"]) for r in wago_table("ItemSparse", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD)}
    write_json(FACTS_PATH, {
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} (compared with {WAGO_ERA_BRANCH} {WAGO_ERA_BUILD})",
        "clientBuild": WAGO_BUILD,
        "attribution": ATTRIBUTION,
        "encounterJournal": False,
        "eraLeftovers": era_leftovers(gear_ids, era_ids),
        "deprecated": facts["deprecated"],
        "crafted": _keyed(crafted),
        "requires": _keyed(facts["requires"]),
        "reputation": _keyed(facts["reputation"]),
        "pvp": _keyed(facts["pvp"]),
        "bindOnPickup": _keyed(facts["bindOnPickup"]),
    })
    print(f"crafted {len(crafted):,}, PvP {len(facts['pvp']):,}, deprecated {len(facts['deprecated']):,}")
    return crafted


def _gated_quests(
    tables: Mapping[str, list[Row]],
    maps_of: Callable[[Row], set[int]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    instance_types: Mapping[int, int],
) -> set[int]:
    in_raids, elsewhere = creature_items_by_place(
        tables["creature_template"], maps_of, creature_loot, references, instance_types,
    )
    for name in OTHER_LOOT_TABLES:
        index = loot_index(tables[name])
        elsewhere |= table_items(index, references, index.keys())
    elsewhere |= {as_int(r["item"]) for r in (*tables["npc_vendor"], *tables["npc_vendor_template"])}
    start_items = {as_int(r["startquest"]): as_int(r["entry"]) for r in tables["item_template"] if as_int(r["startquest"]) > 0}
    raid_given = raid_given_quests(tables["creature_questrelation"], tables["creature_template"], maps_of, instance_types)
    return raid_gated_quests(tables["quest_template"], start_items, in_raids - elsewhere, elsewhere, raid_given)


def _classic_sources(gear_ids: set[int], crafted: Mapping[int, Any]) -> None:
    """Write ``classic/gearSources.json`` (+ LICENSE, README)."""
    tables = read_dump(cmangos_dump(), {
        "quest_template", "item_template", "creature_template", "creature", "creature_questrelation",
        "creature_loot_template", "reference_loot_template", "npc_vendor", "npc_vendor_template",
        "conditions", *OTHER_LOOT_TABLES,
    })
    listed = {row[0] for row in _load_json(WORLD_MAP_CLASSIC / "classicQuests.json")["quests"]}
    instance_types = {as_int(r["ID"]): as_int(r["InstanceType"]) for r in wago_table("Map")}
    encounters: dict[int, set[str]] = defaultdict(set)
    for row in wago_table("DungeonEncounter"):
        encounters[as_int(row["MapID"])].add(row["Name_lang"])
    creature_loot = loot_index(tables["creature_loot_template"])
    references = loot_index(tables["reference_loot_template"])
    maps_of = creature_maps(tables["creature"], encounters)
    gated = _gated_quests(tables, maps_of, creature_loot, references, instance_types)
    gated_rewards = set().union(*(quest_reward_ids(q) for q in tables["quest_template"] if as_int(q["entry"]) in gated))
    quests = quest_rewards(tables["quest_template"], listed, gear_ids, gated)
    drops, raid_boss = boss_drops(
        tables["creature_template"], maps_of, creature_loot, references, instance_types, encounters, gear_ids,
    )
    raid_only = sorted(((raid_boss | gated_rewards) & gear_ids) - set(quests) - set(drops) - set(crafted))
    write_json(SOURCES_PATH, {
        "source": {"repo": "cmangos/classic-db", "commit": CMANGOS_COMMIT, "license": "GPL-3.0-or-later"},
        "dungeons": _keyed(dungeon_levels(_load_json(WORLD_MAP_CLASSIC / "classicDungeons.json"))),
        "raidOnly": raid_only,
        "pvp": classic_pvp_items(
            tables["item_template"],
            (*tables["npc_vendor"], *tables["npc_vendor_template"]),
            {as_int(r["condition_entry"]): r for r in tables["conditions"]},
            gear_ids,
        ),
        "quests": _keyed(quests),
        "drops": _keyed(drops),
    })
    shutil.copyfile(CLASSIC_LICENSE, CLASSIC_DIR / "LICENSE")
    (CLASSIC_DIR / "README.md").write_text(CLASSIC_README.format(commit=CMANGOS_COMMIT), encoding="utf-8")
    print(
        f"quest rewards {len(quests):,}, dungeon drops {len(drops):,}, raid-gated quests {len(gated):,}, "
        f"raid/world-boss only {len(raid_only):,}"
    )


def main() -> None:
    gear_ids = {row[0] for row in _load_json(ITEMS_PATH)["items"]}
    print(f"{len(gear_ids):,} gear items; loading Forever tables ({WAGO_BRANCH} {WAGO_BUILD})...")
    crafted = _forever_facts(gear_ids)
    print("Reading cmangos classic-db...")
    _classic_sources(gear_ids, crafted)
    print(f"-> {DATA_DIR}")


if __name__ == "__main__":
    main()
