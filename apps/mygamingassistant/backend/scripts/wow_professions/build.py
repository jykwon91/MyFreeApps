"""Build the WoW Forever Tailoring and Enchanting leveling guide data.

    python -m scripts.wow_professions.build

Writes, under ``frontend/src/games/wow-forever/data/professions/crafting/``:

* ``tailoring.json`` / ``enchanting.json`` — every recipe in the Forever beta
  client: yellow / grey skill, reagents, what it makes (and whether that can
  be disenchanted), how it is learned, and what Forever changed against the
  Classic Era client. Game data © Blizzard Entertainment.
* ``classic/trainerSkills.json`` — the skill a trainer asks before teaching a
  recipe, and ``classic/sources.json`` — where pattern / formula items and
  reagents come from (vendors, drops, quests, disenchanting). Both are
  server-side, so they come from cmangos classic-db (GPL-3.0, pinned commit)
  and are kept apart with its LICENSE.

The leveling route itself is hand-picked in the frontend
(``data/professions/crafting/*Route.ts``) and checked against these files.
Never hand-edit the JSON; re-run this.
"""
from __future__ import annotations

import shutil
from collections import defaultdict

from scripts.wow_food.build import (
    CLASSIC_LICENSE,
    WOW_DATA_DIR,
    load_item_spells,
    load_trainer_skill,
    quest_details,
)
from scripts.wow_food.recipe_sources import MOB_COLUMNS, VENDOR_COLUMNS, ClassicSources
from scripts.wow_professions.crafts import (
    ACQUIRE_ON_SKILL_LEARN,
    EFFECT_CREATE_ITEM,
    EFFECT_ENCHANT_ITEM,
    EFFECT_LEARN_SPELL,
    ENCHANTING_SKILL_LINE,
    TAILORING_SKILL_LINE,
    TEACHING_PREFIXES,
    ClientRecipes,
    Items,
    build_recipes,
    forever_trainer_skill,
)
from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.map_art import WorldMapArt
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
from scripts.wow_world_map.zones import load_zones

DATA_DIR = WOW_DATA_DIR / "professions" / "crafting"
CLASSIC_DIR = DATA_DIR / "classic"
PROFESSIONS = {"tailoring": TAILORING_SKILL_LINE, "enchanting": ENCHANTING_SKILL_LINE}
# Professions whose recipes make reagents another profession uses ("made by Blacksmithing").
CRAFTING_SKILL_LINES = {
    164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy", 185: "Cooking", 186: "Mining",
    197: "Tailoring", 202: "Engineering", 333: "Enchanting",
}


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def load_client(skill_line: int, branch: str, build: str) -> ClientRecipes:
    kw = {"branch": branch, "build": build}
    abilities: dict[int, tuple[int, int, bool]] = {}
    for r in wago_table("SkillLineAbility", **kw):
        if _int(r["SkillLine"]) == skill_line and _int(r["TrivialSkillLineRankHigh"]) > 0:
            on_learn = _int(r["AcquireMethod"]) == ACQUIRE_ON_SKILL_LEARN
            abilities.setdefault(
                _int(r["Spell"]),
                (_int(r["TrivialSkillLineRankLow"]), _int(r["TrivialSkillLineRankHigh"]), on_learn),
            )
    names = {_int(r["ID"]): r["Name_lang"].strip() for r in wago_table("SpellName", **kw) if _int(r["ID"]) in abilities}
    reagents: dict[int, list[tuple[int, int]]] = {}
    for r in wago_table("SpellReagents", **kw):
        if _int(r["SpellID"]) in abilities:
            pairs = [(_int(r[f"Reagent_{i}"]), _int(r[f"ReagentCount_{i}"])) for i in range(8)]
            reagents[_int(r["SpellID"])] = [(item, count) for item, count in pairs if item]
    creates: dict[int, tuple[int, int]] = {}
    enchants: set[int] = set()
    for r in wago_table("SpellEffect", **kw):
        spell = _int(r["SpellID"])
        if spell not in abilities or _int(r["DifficultyID"]) != 0:
            continue
        if _int(r["Effect"]) == EFFECT_CREATE_ITEM and _int(r["EffectItemType"]):
            creates.setdefault(spell, (_int(r["EffectItemType"]), max(1, _int(r["EffectBasePointsF"]))))
        elif _int(r["Effect"]) == EFFECT_ENCHANT_ITEM:
            enchants.add(spell)
    return ClientRecipes(
        abilities=abilities, names=names, reagents=reagents, creates=creates, enchants=enchants,
        tools=_tools(set(abilities), kw),
    )


def _tools(spells: set[int], kw: dict[str, str]) -> dict[int, tuple[int, str]]:
    """Recipe spell -> the tool it needs: a totem category ("Runed Copper Rod") and the item that is one."""
    category_item: dict[int, tuple[int, str]] = {}
    for r in sorted(wago_table("ItemSparse", **kw), key=lambda r: _int(r["ID"])):
        if _int(r.get("TotemCategoryID")):
            category_item.setdefault(_int(r["TotemCategoryID"]), (_int(r["ID"]), r["Display_lang"]))
    tools: dict[int, tuple[int, str]] = {}
    for r in wago_table("SpellTotems", **kw):
        spell = _int(r["SpellID"])
        if spell in spells and (tool := category_item.get(_int(r["RequiredTotemCategoryID_0"]))):
            tools[spell] = tool
    return tools


def load_items(skill_lines: set[int]) -> Items:
    sparse = {_int(r["ID"]): r for r in wago_table("ItemSparse")}
    learn_effects: dict[int, list[int]] = defaultdict(list)
    for r in wago_table("SpellEffect"):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL and _int(r["DifficultyID"]) == 0:
            learn_effects[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))
    taught_by: dict[int, tuple[int, str, int]] = {}
    for item_id, spells in sorted(load_item_spells().items()):
        row = sparse.get(item_id)
        if row is None or _int(row["RequiredSkill"]) not in skill_lines:
            continue
        if not row["Display_lang"].startswith(TEACHING_PREFIXES):
            continue
        for spell in spells:
            for recipe in [spell, *learn_effects.get(spell, [])]:
                taught_by.setdefault(recipe, (item_id, row["Display_lang"], _int(row["RequiredSkillRank"])))
    return Items(
        names={i: r["Display_lang"] for i, r in sparse.items()},
        quality={i: _int(r["OverallQualityID"]) for i, r in sparse.items()},
        item_class={_int(r["ID"]): _int(r["ClassID"]) for r in wago_table("Item")},
        taught_by=taught_by,
    )


def made_by(items: set[int]) -> dict[str, str]:
    """Reagent -> the profession that makes it, from the Forever client's recipes."""
    lines: dict[int, int] = {}
    for r in wago_table("SkillLineAbility"):
        if _int(r["SkillLine"]) in CRAFTING_SKILL_LINES and _int(r["TrivialSkillLineRankHigh"]) > 0:
            lines.setdefault(_int(r["Spell"]), _int(r["SkillLine"]))
    out: dict[str, str] = {}
    for r in wago_table("SpellEffect"):
        line = lines.get(_int(r["SpellID"]))
        item = _int(r["EffectItemType"])
        if line and _int(r["Effect"]) == EFFECT_CREATE_ITEM and item in items:
            out.setdefault(str(item), CRAFTING_SKILL_LINES[line])
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


UNCOMMON = 2
RARE = 3
ITEM_CLASS_WEAPON = 2
ITEM_CLASS_ARMOR = 4
ARMOR_SUBCLASS_SHIELD = 6
INVENTORY_HELD_IN_OFF_HAND = 23
DISENCHANT_COLUMNS = ["minLevel", "maxLevel", "chance", "mostlyFrom", "fromBlue"]


def _roll_chances(rows: list[dict]) -> dict[int, float]:
    """Item -> percent per disenchant from one loot table. Chance 0 in a group shares what the group's set chances leave."""
    chances: dict[int, float] = {}
    groups: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        groups[int(r["groupid"] or 0)].append(r)
    for group in groups.values():
        left = 100 - sum(float(r["ChanceOrQuestChance"] or 0) for r in group)
        shared = [r for r in group if not float(r["ChanceOrQuestChance"] or 0)]
        for r in group:
            chance = float(r["ChanceOrQuestChance"] or 0) or max(left, 0) / len(shared)
            item = int(r["item"] or 0)
            chances[item] = max(chances.get(item, 0), chance)
    return chances


def disenchanted_items() -> dict[int, list[object]]:
    """Items disenchanting gives (dusts, essences, shards) -> how a leveling enchanter gets them from green items.

    ``[minLevel, maxLevel, chance, mostlyFrom, fromBlue]``: the "Requires
    level" band of the green items that can give it, the best percent per
    disenchant, whether green weapons or armour give it most (None when
    neither is most), and whether blue items give it (shards). cmangos
    ``disenchant_loot_template`` joined to ``item_template.DisenchantID``.
    """
    tables = read_dump(cmangos_dump(), {"disenchant_loot_template", "item_template"})
    rows: dict[int, list[dict]] = defaultdict(list)
    for r in tables["disenchant_loot_template"]:
        if int(r["mincountOrRef"] or 0) >= 0:
            rows[int(r["entry"] or 0)].append(r)
    chances = {table: _roll_chances(rs) for table, rs in rows.items()}
    levels: dict[int, list[int]] = defaultdict(list)
    # item -> (item type, chance) for every green that can give it
    givers: dict[int, list[tuple[str, float]]] = defaultdict(list)
    from_blue: set[int] = set()
    for item in tables["item_template"]:
        table = int(item["DisenchantID"] or 0)
        if table and int(item["Quality"] or 0) == RARE:
            from_blue.update(chances.get(table, {}))
        required = int(item["RequiredLevel"] or 0)
        kind = _disenchant_kind(item)
        if not table or int(item["Quality"] or 0) != UNCOMMON or not required or not kind:
            continue
        for gives, chance in chances.get(table, {}).items():
            levels[gives].append(required)
            givers[gives].append((kind, chance))
    return {i: [min(lv), max(lv), *_best_giver(givers[i]), i in from_blue] for i, lv in levels.items()}


MOSTLY = 0.8


def _disenchant_kind(item: dict) -> str | None:
    """"weapon" (weapons, shields and off-hands — they share the weapon tables) / "armor" (worn armour)."""
    cls = int(item["class"] or 0)
    if cls == ITEM_CLASS_WEAPON:
        return "weapon"
    if cls != ITEM_CLASS_ARMOR:
        return None
    if int(item["subclass"] or 0) == ARMOR_SUBCLASS_SHIELD or int(item["InventoryType"] or 0) == INVENTORY_HELD_IN_OFF_HAND:
        return "weapon"
    return "armor"


def _best_giver(givers: list[tuple[str, float]]) -> list[object]:
    """``[best percent, "weapon" / "armor" / None]`` — the type when most greens giving it at that chance are one type."""
    top = max(c for _, c in givers)
    kinds = [k for k, c in givers if c == top]
    common = max(set(kinds), key=kinds.count)
    return [round(top), common if kinds.count(common) >= MOSTLY * len(kinds) else None]


CLASSIC_README = """# Crafting guides — Classic server data

Trainers, vendors and loot are server-side, so the Forever client doesn't
ship them. This folder comes from
[cmangos classic-db](https://github.com/cmangos/classic-db) at commit
`{commit}`, licensed GPL-3.0 — see `LICENSE`. No cmangos code is used.

* `trainerSkills.json` — the skill a trainer asks before teaching a recipe
  (`npc_trainer` / `npc_trainer_template`), keyed by recipe spell id:
  `classic` as in cmangos, `forever` an estimate — moved by the same amount
  Forever moved the recipe's yellow skill, as Forever's own pattern items do.
* `sources.json` — where each pattern / formula item and each reagent comes
  from in Classic: vendors, quest rewards, mob drops, containers, and which
  items disenchanting gives, with the "Requires level" band of the green items
  that give each (`disenchant_loot_template` + `item_template`).

Forever may differ; the page labels these as Classic. Generated by
`backend/scripts/wow_professions/build.py`. Never hand-edit.
"""


def main() -> None:
    items = load_items(set(PROFESSIONS.values()))
    recipes: dict[str, list[dict]] = {}
    for key, line in PROFESSIONS.items():
        forever = load_client(line, WAGO_BRANCH, WAGO_BUILD)
        era = load_client(line, WAGO_ERA_BRANCH, WAGO_ERA_BUILD)
        recipes[key] = build_recipes(forever, era, items)

    reagent_ids = {r["id"] for rows in recipes.values() for rec in rows for r in rec["reagents"]}
    crafted = made_by(reagent_ids)
    for key, line in PROFESSIONS.items():
        used = {str(r["id"]) for rec in recipes[key] for r in rec["reagents"]}
        write_json(DATA_DIR / f"{key}.json", {
            "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} (compared with {WAGO_ERA_BRANCH} {WAGO_ERA_BUILD})",
            "skillLine": line,
            "madeBy": {k: v for k, v in crafted.items() if k in used},
            "recipes": recipes[key],
        })

    trainer_skills: dict[str, dict[str, dict[str, int]]] = {}
    for key, line in PROFESSIONS.items():
        classic_skill = load_trainer_skill(line)
        trainer_skills[key] = {
            str(rec["spell"]): {"classic": classic_skill[rec["spell"]], "forever": forever_trainer_skill(classic_skill[rec["spell"]], rec)}
            for rec in recipes[key]
            if rec["learn"]["source"] == "trainer" and rec["spell"] in classic_skill
        }
    _, zone_bounds = load_zones()
    classic = ClassicSources(zone_bounds, WorldMapArt())
    teaching = sorted({rec["learn"]["itemId"] for rows in recipes.values() for rec in rows if rec["learn"].get("itemId")})
    recipe_sources = {str(i): classic.recipe_sources(i) for i in teaching}
    reagent_sources = {str(i): classic.reagent_sources(i) for i in sorted(reagent_ids)}
    everything = [*recipe_sources.values(), *reagent_sources.values()]
    quests = quest_details({q for s in everything for q in s.get("quests", [])})
    for s in everything:
        if "quests" in s:
            s["quests"] = [q for q in s["quests"] if str(q) in quests]
            if not s["quests"]:
                del s["quests"]
    zone_names = {z.ui_map_id: z.name for z in zone_bounds}
    for q in quests.values():
        for giver in q[4]:
            classic.zone_names[giver[3]] = zone_names[giver[3]]
    write_json(CLASSIC_DIR / "trainerSkills.json", {"source": f"cmangos/classic-db@{CMANGOS_COMMIT}", **trainer_skills})
    write_json(CLASSIC_DIR / "sources.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "vendorColumns": VENDOR_COLUMNS,
        "mobColumns": MOB_COLUMNS,
        "questColumns": ["id", "title", "level", "side", "givers"],
        "questGiverColumns": ["type", "entry", "name", "zone", "subzone", "x", "y", "faction"],
        "quests": quests,
        "zones": {str(k): v for k, v in sorted(classic.zone_names.items())},
        "recipes": {k: v for k, v in recipe_sources.items() if v},
        "reagents": {k: v for k, v in reagent_sources.items() if v},
        "disenchantColumns": DISENCHANT_COLUMNS,
        "disenchant": {str(i): lv for i, lv in sorted(disenchanted_items().items()) if i in reagent_ids},
    })
    shutil.copyfile(CLASSIC_LICENSE, CLASSIC_DIR / "LICENSE")
    (CLASSIC_DIR / "README.md").write_text(CLASSIC_README.format(commit=CMANGOS_COMMIT), encoding="utf-8")
    print(", ".join(f"{k}: {len(v)} recipes" for k, v in recipes.items())
          + f"; {len(recipe_sources)} teaching items, {len(reagent_ids)} reagents -> {DATA_DIR}")


if __name__ == "__main__":
    main()
