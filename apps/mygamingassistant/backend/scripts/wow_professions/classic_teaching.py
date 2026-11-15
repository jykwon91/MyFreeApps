"""What cmangos classic-db's NPCs, quests and items teach, read for ``build_recipes`` (see ``load_classic_teaching``)."""
from __future__ import annotations

from collections import defaultdict

from scripts.wow_food.build import _int
from scripts.wow_food.recipe_sources import ClassicSources
from scripts.wow_professions.crafts import EFFECT_LEARN_SPELL, TEACHING_PREFIXES, ClassicTeaching
from scripts.wow_world_map.sources import WAGO_ERA_BRANCH, WAGO_ERA_BUILD, cmangos_dump, wago_table
from scripts.wow_world_map.sql_dump import read_dump

# cmangos ``dbscripts_on_gossip.command``: cast ``datalong`` (an NPC teaching a recipe by casting its teaching spell).
SCRIPT_COMMAND_CAST_SPELL = 15
# cmangos ``gameobject_template.type`` whose ``data3`` is its gossip menu (the Journal of Jandice Barov).
GAMEOBJECT_TYPE_QUESTGIVER = 2


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
