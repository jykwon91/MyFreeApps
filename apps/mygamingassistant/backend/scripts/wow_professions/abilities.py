"""Blizzard's recipe ids → the recipe spells our crafting files are keyed by.

    python -m scripts.wow_professions.abilities

The Profile API's ``/professions`` lists a character's known recipes by the
client's ``SkillLineAbility`` row id (Bolt of Linen Cloth = 2359), not the
spell (2963) that ``data/professions/crafting/<profession>.json`` uses. The
character page joins the two through
``data/character/recipeSpells.json``: ``{"spells": {"<ability id>": spell}}``
for every profession skill line, from the Forever client (wago.tools, the
pinned build). Game data © Blizzard Entertainment. Never hand-edit it; re-run this.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_gear.build import write_json
from scripts.wow_gear.loot import as_int
from scripts.wow_professions.build import CRAFTING_SKILL_LINES
from scripts.wow_world_map.sources import wago_table

RECIPE_SPELLS_FILE = WOW_DATA_DIR / "character" / "recipeSpells.json"


def ability_spells(rows: Iterable[Mapping[str, str]], skill_lines: Iterable[int]) -> dict[str, int]:
    """Ability id → spell for the given skill lines, by ability id."""
    lines = set(skill_lines)
    spells = {
        as_int(row["ID"]): as_int(row["Spell"])
        for row in rows
        if as_int(row["SkillLine"]) in lines and as_int(row["ID"]) and as_int(row["Spell"])
    }
    return {str(ability): spells[ability] for ability in sorted(spells)}


def main() -> None:
    spells = ability_spells(wago_table("SkillLineAbility"), CRAFTING_SKILL_LINES)
    write_json(RECIPE_SPELLS_FILE, {"spells": spells})
    print(f"wrote {len(spells)} recipe ids to {RECIPE_SPELLS_FILE}")


if __name__ == "__main__":
    main()
