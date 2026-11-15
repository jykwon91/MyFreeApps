"""Build the WoW Forever crafting leveling guide data (Tailoring, Enchanting, Alchemy, Blacksmithing,
Leatherworking, Engineering, First Aid).

    python -m scripts.wow_professions.build

Writes, under ``frontend/src/games/wow-forever/data/professions/crafting/``:

* ``mining.json`` — every Mining recipe that makes something (SkillLine 186):
  the smelts with the forge each needs, and Forever's campsite items, for the
  Mining guide on the Professions page.
* ``<profession>.json`` (one per key of ``PROFESSIONS``) — every recipe in the Forever
  client: yellow / grey skill, reagents, what it makes (and whether that can
  be disenchanted; for Engineering, the item's tooltip line), how it is learned, and what Forever changed against the
  Classic Era client. Game data © Blizzard Entertainment.
* ``classic/trainerSkills.json`` — the skill a trainer asks before teaching a
  recipe, and ``classic/sources.json`` — where pattern / formula / manual items and
  reagents come from (vendors, drops, quests, disenchanting). Both are
  server-side, so they come from cmangos classic-db (GPL-3.0, pinned commit)
  and are kept apart with its LICENSE.
* ``classic/skinning.json`` — for the Skinning guide: every mob a solo player
  can skin, once per zone it has a pack in (levels, spawns, densest pack, the
  leather it gives most), and the leather each mob level gives (cmangos
  ``skinning_loot_template`` + creature levels; same LICENSE).

The leveling route itself is hand-picked in the frontend
(``data/professions/crafting/*Route.ts``) and checked against these files.
Never hand-edit the JSON; re-run this.
"""
from __future__ import annotations

import shutil
from collections import defaultdict
from dataclasses import replace

from scripts.wow_food.build import (
    CLASSIC_LICENSE,
    WOW_DATA_DIR,
    load_book,
    load_item_spells,
    load_trainer_skill,
    quest_details,
)
from scripts.wow_food.recipe_sources import (
    MOB_COLUMNS,
    VENDOR_COLUMNS,
    ClassicSources,
    territory_of,
)
from scripts.wow_food.skinning_sources import SKIN_MOB_COLUMNS
from scripts.wow_professions.crafts import (
    ACQUIRE_ON_SKILL_LEARN,
    ALCHEMY_SKILL_LINE,
    BLACKSMITHING_SKILL_LINE,
    EFFECT_CREATE_ITEM,
    EFFECT_ENCHANT_ITEM,
    EFFECT_LEARN_SPELL,
    ENCHANTING_SKILL_LINE,
    ENGINEERING_SKILL_LINE,
    FIRST_AID_SKILL_LINE,
    LEATHERWORKING_SKILL_LINE,
    MINING_SKILL_LINE,
    TAILORING_SKILL_LINE,
    TEACHING_PREFIXES,
    ClassicTeaching,
    ClientRecipes,
    Items,
    build_recipes,
    forever_trainer_skill,
    mining_records,
    smelting_for,
    sod_only_spells,
)
from scripts.wow_professions.effects import add_effects
from scripts.wow_professions.specs import spec_quests, spec_records, trainer_specs
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
PROFESSIONS = {
    "tailoring": TAILORING_SKILL_LINE,
    "enchanting": ENCHANTING_SKILL_LINE,
    "alchemy": ALCHEMY_SKILL_LINE,
    "blacksmithing": BLACKSMITHING_SKILL_LINE,
    "leatherworking": LEATHERWORKING_SKILL_LINE,
    "engineering": ENGINEERING_SKILL_LINE,
    "firstaid": FIRST_AID_SKILL_LINE,
}
# Professions a miner levels: their file lists the smelts that make the bars they use.
SMELTS_FOR = {"blacksmithing", "engineering"}
# Professions whose items are named for what they do, not what they are: each recipe carries its tooltip line.
DESCRIBES_FOR = {"engineering"}
# Professions whose recipes make reagents another profession uses ("made by Blacksmithing").
CRAFTING_SKILL_LINES = {
    129: "First Aid", 164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy", 185: "Cooking", 186: "Mining",
    197: "Tailoring", 202: "Engineering", 333: "Enchanting",
}
# cmangos ``dbscripts_on_gossip.command``: cast ``datalong`` (an NPC teaching a recipe by casting its teaching spell).
SCRIPT_COMMAND_CAST_SPELL = 15
# cmangos ``gameobject_template.type`` whose ``data3`` is its gossip menu (the Journal of Jandice Barov).
GAMEOBJECT_TYPE_QUESTGIVER = 2


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


def load_spell_focus(spells: set[int]) -> dict[int, str]:
    """Recipe spell -> the object it is cast next to ("Forge", "Molten Foundry"), from the Forever client."""
    kw = {"branch": WAGO_BRANCH, "build": WAGO_BUILD}
    names = {_int(r["ID"]): r["Name_lang"].strip() for r in wago_table("SpellFocusObject", **kw)}
    out: dict[int, str] = {}
    for r in wago_table("SpellCastingRequirements", **kw):
        spell, focus = _int(r["SpellID"]), _int(r["RequiresSpellFocus"])
        if spell in spells and names.get(focus):
            out[spell] = names[focus]
    return out


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


def with_child_skill_lines(skill_lines: set[int], rows: list[dict]) -> set[int]:
    """``skill_lines`` plus the Forever client's child lines of them (``SkillLine.ParentSkillLineID``).

    Forever's First Aid manuals ask for First Aid's child line 2942, not 129.
    """
    return skill_lines | {_int(r["ID"]) for r in rows if _int(r["ParentSkillLineID"]) in skill_lines}


def load_items(skill_lines: set[int]) -> Items:
    sparse = {_int(r["ID"]): r for r in wago_table("ItemSparse")}
    skill_lines = with_child_skill_lines(skill_lines, wago_table("SkillLine"))
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
                taught_by.setdefault(
                    recipe,
                    (item_id, row["Display_lang"], _int(row["RequiredSkillRank"]), _int(row["RequiredAbility"])),
                )
    return Items(
        names={i: r["Display_lang"] for i, r in sparse.items()},
        quality={i: _int(r["OverallQualityID"]) for i, r in sparse.items()},
        item_class={_int(r["ID"]): _int(r["ClassID"]) for r in wago_table("Item")},
        taught_by=taught_by,
    )


def _recipes_taught(spells: set[int], teaches: dict[int, list[int]]) -> set[int]:
    """The spells themselves plus the recipes their LEARN_SPELL effects teach."""
    return {recipe for spell in spells for recipe in [spell, *teaches.get(spell, [])]}


def _by_recipe[T](taught_by: dict[int, list[T]], teaches: dict[int, list[int]]) -> dict[int, tuple[T, ...]]:
    """Teaching spell -> what teaches it, turned into recipe -> the same (through ``_recipes_taught``), in first-seen order."""
    out: dict[int, list[T]] = defaultdict(list)
    for spell, teachers in sorted(taught_by.items()):
        for recipe in sorted(_recipes_taught({spell}, teaches)):
            out[recipe].extend(t for t in teachers if t not in out[recipe])
    return {recipe: tuple(teachers) for recipe, teachers in out.items()}


def gossip_teachers(tables: dict[str, list[dict]]) -> dict[int, list[str]]:
    """Teaching spell -> the NPCs and objects whose gossip casts it, from cmangos (empty when no one owns the menu).

    A gossip script runs from a menu option (``action_script_id``) or a whole
    menu (``script_id``); the menu is a creature's ``GossipMenuId`` or a quest
    giver object's ``data3``.
    """
    owners: dict[int, list[str]] = defaultdict(list)
    for npc in tables["creature_template"]:
        if menu := int(npc["GossipMenuId"] or 0):
            owners[menu].append(npc["Name"])
    for obj in tables["gameobject_template"]:
        if int(obj["type"] or 0) == GAMEOBJECT_TYPE_QUESTGIVER and (menu := int(obj["data3"] or 0)):
            owners[menu].append(obj["name"])
    menus_of: dict[int, set[int]] = defaultdict(set)
    for option in tables["gossip_menu_option"]:
        if script := int(option["action_script_id"] or 0):
            menus_of[script].add(int(option["menu_id"] or 0))
    for menu in tables["gossip_menu"]:
        if script := int(menu["script_id"] or 0):
            menus_of[script].add(int(menu["entry"] or 0))
    out: dict[int, list[str]] = defaultdict(list)
    for r in tables["dbscripts_on_gossip"]:
        if int(r["command"] or 0) != SCRIPT_COMMAND_CAST_SPELL:
            continue
        names = out[int(r["datalong"] or 0)]
        for menu in sorted(menus_of.get(int(r["id"] or 0), ())):
            names.extend(n for n in owners.get(menu, []) if n not in names)
    return out


def quest_teachers(quests: list[dict]) -> dict[int, list[tuple[int, str]]]:
    """Teaching spell -> the cmangos quests whose reward casts it, as (id, title)."""
    out: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for q in sorted(quests, key=lambda q: int(q["entry"] or 0)):
        for key in ("RewSpell", "RewSpellCast"):
            spell = int(q[key] or 0)
            quest = (int(q["entry"] or 0), q["Title"])
            if spell and quest not in out[spell]:
                out[spell].append(quest)
    return out


def era_teaching_items(classic_items: frozenset[int], teaches: dict[int, list[int]], kw: dict[str, str]) -> dict[int, tuple[int, str, int]]:
    """Recipe -> the Classic Era client's Pattern / Formula / ... for it that is a Classic item: (id, name, skill it asks).

    Where several teach one recipe, the lowest item id.
    """
    sparse = {_int(r["ID"]): r for r in wago_table("ItemSparse", **kw, hotfixes=True)}
    taught: dict[int, list[tuple[int, str, int]]] = defaultdict(list)
    for r in wago_table("ItemEffect", **kw):
        item = _int(r["ParentItemID"])
        row = sparse.get(item)
        if item not in classic_items or row is None or not row["Display_lang"].startswith(TEACHING_PREFIXES):
            continue
        taught[_int(r["SpellID"])].append((item, row["Display_lang"], _int(row["RequiredSkillRank"])))
    return {recipe: min(found) for recipe, found in _by_recipe(taught, teaches).items()}


def load_classic_teaching(classic_sources: ClassicSources) -> ClassicTeaching:
    """What cmangos classic-db's NPCs, quests and items teach, for ``build_recipes`` (``trainer`` is per profession: empty here).

    cmangos names teaching spells; the Classic Era client's LEARN_SPELL effects
    say which recipe each teaches, and its ItemEffect rows which item teaches
    it. ``classic_sources`` says which of those items anything gives.
    """
    kw = {"branch": WAGO_ERA_BRANCH, "build": WAGO_ERA_BUILD}
    teaches: dict[int, list[int]] = defaultdict(list)
    for r in wago_table("SpellEffect", **kw):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL:
            teaches[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))

    tables = read_dump(cmangos_dump(), {
        "item_template", "quest_template", "dbscripts_on_gossip", "gossip_menu", "gossip_menu_option",
        "creature_template", "gameobject_template",
    })
    classic_items = frozenset(int(r["entry"] or 0) for r in tables["item_template"])
    era_item = era_teaching_items(classic_items, teaches, kw)
    return ClassicTeaching(
        trainer=frozenset(),
        items=classic_items,
        quest=_by_recipe(quest_teachers(tables["quest_template"]), teaches),
        npc=_by_recipe(gossip_teachers(tables), teaches),
        era_item=era_item,
        sourced=frozenset(i for i, _, _ in era_item.values() if classic_sources.recipe_sources(i)),
    )


def made_by(items: set[int], sod_only: set[int]) -> dict[str, str]:
    """Reagent -> the profession that makes it, from the Forever client's recipes (Season of Discovery's left out)."""
    lines: dict[int, int] = {}
    for r in wago_table("SkillLineAbility"):
        if _int(r["Spell"]) in sod_only:
            continue
        if _int(r["SkillLine"]) in CRAFTING_SKILL_LINES and _int(r["TrivialSkillLineRankHigh"]) > 0:
            lines.setdefault(_int(r["Spell"]), _int(r["SkillLine"]))
    out: dict[str, str] = {}
    for r in wago_table("SpellEffect"):
        line = lines.get(_int(r["SpellID"]))
        item = _int(r["EffectItemType"])
        if line and _int(r["Effect"]) == EFFECT_CREATE_ITEM and item in items:
            out.setdefault(str(item), CRAFTING_SKILL_LINES[line])
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def maker_records(item_ids: set[int], recipes: list[dict]) -> dict[str, dict]:
    """Item -> what one craft of it takes, and the same for those reagents in turn.

    Prices an item nobody sells yet (a rod Blacksmithing makes) from its
    materials. Where several recipes make an item, the one learned first.
    """
    makers_of: dict[int, list[dict]] = defaultdict(list)
    for rec in recipes:
        if rec.get("creates"):
            makers_of[rec["creates"]["id"]].append(rec)
    out: dict[str, dict] = {}
    todo = sorted(item_ids)
    while todo:
        item = todo.pop()
        if str(item) in out or item not in makers_of:
            continue
        rec = min(makers_of[item], key=lambda r: (r["yellow"], r["spell"]))
        out[str(item)] = {"count": rec["creates"]["count"], "reagents": rec["reagents"]}
        todo.extend(r["id"] for r in rec["reagents"])
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
  that give each (`disenchant_loot_template` + `item_template`). A recipe's
  `price` is what its vendors ask (`item_template.BuyPrice`, copper, before
  any reputation discount).

Forever may differ; the page labels these as Classic. Generated by
`backend/scripts/wow_professions/build.py`. Never hand-edit.
"""


def profession_recipes(
    line: int, items: Items, classic: ClassicTeaching, trainer: dict[int, int], specs: dict[int, int] | None = None,
) -> tuple[list[dict], set[int]]:
    """A skill line's Forever recipes (``build_recipes``) and the Season of Discovery ones left out of them."""
    forever = load_client(line, WAGO_BRANCH, WAGO_BUILD)
    era = load_client(line, WAGO_ERA_BRANCH, WAGO_ERA_BUILD)
    taught = replace(classic, trainer=frozenset(trainer))
    return build_recipes(forever, era, items, taught, specs), sod_only_spells(forever, era, items, taught)


def main() -> None:
    items = load_items(set(PROFESSIONS.values()))
    zone_entries, zone_bounds = load_zones()
    classic_sources = ClassicSources(zone_bounds, WorldMapArt())
    classic = load_classic_teaching(classic_sources)
    trainer_skill = {line: load_trainer_skill(line) for line in [*PROFESSIONS.values(), MINING_SKILL_LINE]}
    recipes: dict[str, list[dict]] = {}
    quests_of: dict[str, list] = {}
    sod_only: set[int] = set()
    for key, line in PROFESSIONS.items():
        quests_of[key] = spec_quests(line)
        recipes[key], dropped = profession_recipes(line, items, classic, trainer_skill[line], trainer_specs(line, quests_of[key]))
        sod_only |= dropped
    mining, dropped = profession_recipes(MINING_SKILL_LINE, items, classic, trainer_skill[MINING_SKILL_LINE])
    sod_only |= dropped
    mining_trainer = trainer_skill[MINING_SKILL_LINE]
    book, item_spells = load_book(), load_item_spells()
    for key in DESCRIBES_FOR:
        add_effects(recipes[key], book, item_spells)
    smelting = {key: smelting_for(recipes[key], mining, mining_trainer) if key in SMELTS_FOR else [] for key in PROFESSIONS}

    write_json(DATA_DIR / "mining.json", {
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} (compared with {WAGO_ERA_BRANCH} {WAGO_ERA_BUILD})",
        "skillLine": MINING_SKILL_LINE,
        **mining_records(mining, mining_trainer, load_spell_focus({rec["spell"] for rec in mining})),
    })

    reagent_ids = {r["id"] for rows in [*recipes.values(), *smelting.values()] for rec in rows for r in rec["reagents"]}
    crafted = made_by(reagent_ids, sod_only)
    every_recipe = [rec for rows in [*recipes.values(), mining] for rec in rows]
    for key, line in PROFESSIONS.items():
        used = {str(r["id"]) for rec in [*recipes[key], *smelting[key]] for r in rec["reagents"]}
        extra: dict[str, object] = {}
        if smelting[key]:
            extra["smelting"] = smelting[key]
        # The profession prices its own crafts and smelts from `recipes` / `smelting`; these are everyone else's.
        own = {rec["creates"]["id"] for rec in [*recipes[key], *smelting[key]] if rec.get("creates")}
        others = {int(k) for k, v in crafted.items() if k in used and v != CRAFTING_SKILL_LINES[line]} - own
        makers = maker_records(others, every_recipe)
        if makers:
            extra["makers"] = makers
        if quests_of[key]:
            extra["specs"] = spec_records(line, quests_of[key], items.names)
        write_json(DATA_DIR / f"{key}.json", {
            "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} (compared with {WAGO_ERA_BRANCH} {WAGO_ERA_BUILD})",
            "skillLine": line,
            "madeBy": {k: v for k, v in crafted.items() if k in used},
            "recipes": recipes[key],
            **extra,
        })

    trainer_skills: dict[str, dict[str, dict[str, int]]] = {}
    for key, line in PROFESSIONS.items():
        classic_skill = trainer_skill[line]
        trainer_skills[key] = {
            str(rec["spell"]): {"classic": classic_skill[rec["spell"]], "forever": forever_trainer_skill(classic_skill[rec["spell"]], rec)}
            for rec in recipes[key]
            if rec["learn"]["source"] == "trainer" and rec["spell"] in classic_skill
        }
    teaching = sorted({rec["learn"]["itemId"] for rows in recipes.values() for rec in rows if rec["learn"].get("itemId")})
    recipe_sources = {str(i): classic_sources.recipe_sources(i) for i in teaching}
    reagent_sources = {str(i): classic_sources.reagent_sources(i) for i in sorted(reagent_ids)}
    everything = [*recipe_sources.values(), *reagent_sources.values()]
    spec_quest_ids = {q.quest for qs in quests_of.values() for q in qs}
    quests = quest_details({q for s in everything for q in s.get("quests", [])} | spec_quest_ids)
    for s in everything:
        if "quests" in s:
            s["quests"] = [q for q in s["quests"] if str(q) in quests]
            if not s["quests"]:
                del s["quests"]
    zone_names = {z.ui_map_id: z.name for z in zone_bounds}
    for q in quests.values():
        for giver in q[4]:
            classic_sources.zone_names[giver[3]] = zone_names[giver[3]]
    write_json(CLASSIC_DIR / "trainerSkills.json", {"source": f"cmangos/classic-db@{CMANGOS_COMMIT}", **trainer_skills})
    write_json(CLASSIC_DIR / "sources.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "vendorColumns": VENDOR_COLUMNS,
        "mobColumns": MOB_COLUMNS,
        "questColumns": ["id", "title", "level", "side", "givers"],
        "questGiverColumns": ["type", "entry", "name", "zone", "subzone", "x", "y", "faction"],
        "quests": quests,
        "zones": {str(k): v for k, v in sorted(classic_sources.zone_names.items())},
        "territory": territory_of(classic_sources.zone_names, zone_entries),
        "recipes": {k: v for k, v in recipe_sources.items() if v},
        "reagents": {k: v for k, v in reagent_sources.items() if v},
        "disenchantColumns": DISENCHANT_COLUMNS,
        "disenchant": {str(i): lv for i, lv in sorted(disenchanted_items().items()) if i in reagent_ids},
    })
    skin_mobs = classic_sources.skinnable_mobs()
    skin_zones = {int(str(r[4])) for r in skin_mobs}
    write_json(CLASSIC_DIR / "skinning.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "mobColumns": SKIN_MOB_COLUMNS,
        "mobs": skin_mobs,
        "leatherColumns": ["minLevel", "maxLevel", "leathers"],
        "leather": classic_sources.leather_by_level(),
        "leatherIds": classic_sources.leather_item_ids(),
        "zones": {str(z): zone_names[z] for z in sorted(skin_zones)},
        "territory": territory_of(skin_zones, zone_entries),
    })
    shutil.copyfile(CLASSIC_LICENSE, CLASSIC_DIR / "LICENSE")
    (CLASSIC_DIR / "README.md").write_text(CLASSIC_README.format(commit=CMANGOS_COMMIT), encoding="utf-8")
    print(", ".join(f"{k}: {len(v)} recipes" for k, v in recipes.items())
          + f"; {len(sod_only)} Season of Discovery recipes left out"
          + f"; {len(recipe_sources)} teaching items, {len(reagent_ids)} reagents -> {DATA_DIR}")


if __name__ == "__main__":
    main()
