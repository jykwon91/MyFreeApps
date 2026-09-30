"""Build the WoW Forever food picker data.

    python -m scripts.wow_food.build

Writes, under ``frontend/src/games/wow-forever/data/food/``:

* ``foods.json`` — every cooked food / drink in the Forever beta client:
  level to eat, heal / mana, the Well Fed buff (from the client's tooltip
  text), the Well Fed XP boost, and the recipe item that teaches it.
  Game data © Blizzard Entertainment.
* ``classic/trainerSkills.json`` — the Cooking skill a trainer asks before
  teaching a recipe. Trainers are server-side, so this comes from cmangos
  classic-db (GPL-3.0, pinned commit) and is kept apart with its LICENSE.
* ``classic/recipeSources.json`` — where each recipe and each reagent comes
  from (vendors, quests, drops, fishing, containers), same cmangos source.

Never hand-edit the JSON; re-run this. Sources are pinned in
``scripts/wow_world_map/sources.py``.
"""
from __future__ import annotations

import json
import shutil
from collections import defaultdict
from pathlib import Path

from scripts.wow_food.recipe_sources import MOB_COLUMNS, VENDOR_COLUMNS, ClassicSources
from scripts.wow_food.foods import COOKING_SKILL_LINE, EFFECT_LEARN_SPELL, Tables, build_foods
from scripts.wow_food.tooltip import Effect, SpellBook
from scripts.wow_world_map.sources import (
    CMANGOS_COMMIT,
    WAGO_BRANCH,
    WAGO_BUILD,
    WAGO_ERA_BRANCH,
    WAGO_ERA_BUILD,
    cmangos_dump,
    wago_table,
)
from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.zones import load_zones
from scripts.wow_world_map.sql_dump import read_dump

BACKEND_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
WOW_DATA_DIR = FRONTEND_DIR / "src" / "games" / "wow-forever" / "data"
DATA_DIR = WOW_DATA_DIR / "food"
CLASSIC_DIR = DATA_DIR / "classic"
CLASSIC_LICENSE = WOW_DATA_DIR / "worldMap" / "classic" / "LICENSE"
# The World Map's quest layer (same cmangos commit) — its titles, levels and givers.
CLASSIC_QUESTS = WOW_DATA_DIR / "worldMap" / "classic" / "classicQuests.json"
QUEST_COLUMNS = ["id", "title", "level", "side", "givers"]
QUEST_GIVER_COLUMNS = ["type", "entry", "name", "zone", "subzone", "x", "y", "faction"]


def quest_details(quest_ids: set[int]) -> dict[str, list[object]]:
    """Quest id -> [id, title, level, side, givers] for the quests a recipe or reagent is rewarded by.

    A quest the World Map doesn't list (no placed giver, or not for either
    faction) is left out: the page can't say who gives it.
    """
    data = json.loads(CLASSIC_QUESTS.read_text(encoding="utf-8"))
    qc, gc = data["questColumns"], data["giverColumns"]
    givers: dict[int, list[list[object]]] = defaultdict(list)
    for g in data["givers"]:
        row = dict(zip(gc, g))
        for quest in row["quests"]:
            givers[quest].append([row[c] for c in QUEST_GIVER_COLUMNS])
    out: dict[str, list[object]] = {}
    for q in data["quests"]:
        row = dict(zip(qc, q))
        if row["id"] in quest_ids and givers.get(row["id"]):
            out[str(row["id"])] = [row["id"], row["title"], row["level"], row["side"], givers[row["id"]]]
    return out


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def load_book() -> SpellBook:
    book = SpellBook()
    for r in wago_table("SpellName"):
        book.names[_int(r["ID"])] = r["Name_lang"]
    for r in wago_table("Spell"):
        book.descriptions[_int(r["ID"])] = r["Description_lang"]
        book.aura_descriptions[_int(r["ID"])] = r["AuraDescription_lang"]
    durations = {_int(r["ID"]): _int(r["Duration"]) for r in wago_table("SpellDuration")}
    for r in wago_table("SpellMisc"):
        if _int(r["DifficultyID"]) == 0 and (ms := durations.get(_int(r["DurationIndex"]))):
            book.durations_ms.setdefault(_int(r["SpellID"]), ms)
    effects: dict[int, list[Effect]] = defaultdict(list)
    for r in wago_table("SpellEffect"):
        if _int(r["DifficultyID"]) != 0:
            continue
        effects[_int(r["SpellID"])].append(
            Effect(
                index=_int(r["EffectIndex"]),
                effect=_int(r["Effect"]),
                aura=_int(r["EffectAura"]),
                base_points=float(r["EffectBasePointsF"] or 0),
                misc=_int(r["EffectMiscValue_0"]),
                period_ms=_int(r["EffectAuraPeriod"]),
                trigger=_int(r["EffectTriggerSpell"]),
                item_type=_int(r["EffectItemType"]),
            )
        )
    book.effects = dict(effects)
    return book


def load_item_spells() -> dict[int, list[int]]:
    effects = {_int(r["ID"]): _int(r["SpellID"]) for r in wago_table("ItemEffect")}
    by_item: dict[int, list[int]] = defaultdict(list)
    for r in sorted(wago_table("ItemXItemEffect"), key=lambda r: _int(r["ID"])):
        spell = effects.get(_int(r["ItemEffectID"]))
        if spell:
            by_item[_int(r["ItemID"])].append(spell)
    return dict(by_item)


def load_reagents() -> dict[int, list[tuple[int, int]]]:
    """Recipe spell -> [(reagent item, count)] from the Forever client."""
    reagents: dict[int, list[tuple[int, int]]] = {}
    for r in wago_table("SpellReagents"):
        pairs = [(_int(r[f"Reagent_{i}"]), _int(r[f"ReagentCount_{i}"])) for i in range(8)]
        reagents[_int(r["SpellID"])] = [(item, count) for item, count in pairs if item]
    return reagents


def load_focus() -> dict[int, str]:
    """Recipe spell -> the object it must be cast next to ("Cooking Fire", "Iron Oven")."""
    names = {_int(r["ID"]): r["Name_lang"] for r in wago_table("SpellFocusObject")}
    return {
        _int(r["SpellID"]): names[_int(r["RequiresSpellFocus"])]
        for r in wago_table("SpellCastingRequirements")
        if _int(r["RequiresSpellFocus"]) in names
    }


def load_trainer_skill() -> dict[int, int]:
    """Recipe spell -> lowest Cooking skill a Classic trainer asks to teach it.

    cmangos lists the trainer's *teaching* spell; the Classic Era client's
    LEARN_SPELL effect says which recipe it teaches (the Forever client
    doesn't ship the teaching spells).
    """
    teaches: dict[int, list[int]] = defaultdict(list)
    for r in wago_table("SpellEffect", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL:
            teaches[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))
    rows = read_dump(cmangos_dump(), {"npc_trainer", "npc_trainer_template"})
    skill: dict[int, int] = {}
    for row in rows["npc_trainer"] + rows["npc_trainer_template"]:
        if row["reqskill"] != COOKING_SKILL_LINE:
            continue
        spell = int(row["spell"] or 0)
        value = int(row["reqskillvalue"] or 0)
        for recipe in [spell, *teaches.get(spell, [])]:
            skill[recipe] = min(value, skill.get(recipe, value))
    return skill


CLASSIC_README = """# Food picker — Classic trainer data

`trainerSkills.json` holds the Cooking skill a trainer asks before teaching
a recipe (keyed by the cooked item's id). Trainers are server-side, so the
Forever client doesn't ship this; it comes from
[cmangos classic-db](https://github.com/cmangos/classic-db) at commit
`{commit}` (table `npc_trainer` / `npc_trainer_template`), licensed
GPL-3.0 — see `LICENSE`. No cmangos code is used.

`recipeSources.json` holds where each recipe item and each reagent comes
from in Classic — vendors (`npc_vendor`, `npc_vendor_template`), quest
rewards (`quest_template`), mob drops (`creature_loot_template` +
`reference_loot_template`), fishing (`fishing_loot_template`) and containers
(`item_loot_template`, `gameobject_loot_template`) — from the same commit and
licence. Forever may differ; the page labels it as Classic.

Generated by `backend/scripts/wow_food/build.py`. Never hand-edit.
"""


def main() -> None:
    book = load_book()
    items = {_int(r["ID"]): r for r in wago_table("ItemSparse")}
    trainer_skill = load_trainer_skill()
    tables = Tables(
        abilities=wago_table("SkillLineAbility"),
        items=items,
        item_spells=load_item_spells(),
        book=book,
        trainer_skill={},
        reagents=load_reagents(),
        focus=load_focus(),
    )
    foods = build_foods(tables)
    trainer_skills: dict[str, int] = {}
    recipe_for_item = {
        e.item_type: _int(a["Spell"])
        for a in tables.abilities
        if _int(a["SkillLine"]) == COOKING_SKILL_LINE
        for e in book.effects.get(_int(a["Spell"]), [])
        if e.item_type
    }
    for food in foods:
        if food["learn"]["source"] != "trainer":
            continue
        value = trainer_skill.get(recipe_for_item.get(food["id"], 0))
        if value is not None:
            trainer_skills[str(food["id"])] = value

    write_json(DATA_DIR / "foods.json", {
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD}",
        "foods": foods,
    })
    _, zone_bounds = load_zones()
    classic = ClassicSources(zone_bounds, WorldMapArt())
    recipe_sources = {
        str(f["id"]): classic.recipe_sources(f["learn"]["recipeItem"])
        for f in foods if f["learn"]["recipeItem"]
    }
    reagent_ids = sorted({r["id"] for f in foods for r in f["reagents"]})
    reagent_sources = {str(i): classic.reagent_sources(i) for i in reagent_ids}
    quests = quest_details({
        q for sources_ in [*recipe_sources.values(), *reagent_sources.values()] for q in sources_.get("quests", [])
    })
    for sources_ in [*recipe_sources.values(), *reagent_sources.values()]:
        if "quests" in sources_:
            sources_["quests"] = [q for q in sources_["quests"] if str(q) in quests]
            if not sources_["quests"]:
                del sources_["quests"]
    zone_names = {z.ui_map_id: z.name for z in zone_bounds}
    for q in quests.values():
        for giver in q[4]:
            classic.zone_names[giver[3]] = zone_names[giver[3]]
    write_json(CLASSIC_DIR / "recipeSources.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "vendorColumns": VENDOR_COLUMNS,
        "mobColumns": MOB_COLUMNS,
        "questColumns": QUEST_COLUMNS,
        "questGiverColumns": QUEST_GIVER_COLUMNS,
        "quests": quests,
        "zones": {str(k): v for k, v in sorted(classic.zone_names.items())},
        "recipes": {k: v for k, v in recipe_sources.items() if v},
        "reagents": {k: v for k, v in reagent_sources.items() if v},
    })
    write_json(CLASSIC_DIR / "trainerSkills.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "skills": trainer_skills,
    })
    shutil.copyfile(CLASSIC_LICENSE, CLASSIC_DIR / "LICENSE")
    (CLASSIC_DIR / "README.md").write_text(CLASSIC_README.format(commit=CMANGOS_COMMIT), encoding="utf-8")
    print(f"{len(foods)} foods, {len(trainer_skills)} trainer skills, "
          f"{sum(1 for v in recipe_sources.values() if v)} recipe sources, "
          f"{sum(1 for v in reagent_sources.values() if v)}/{len(reagent_ids)} reagent sources -> {DATA_DIR}")


if __name__ == "__main__":
    main()
