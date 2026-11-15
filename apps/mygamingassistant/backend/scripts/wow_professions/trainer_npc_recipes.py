"""Build per-NPC recipe lists for profession trainers (Classic data, cmangos GPL).

    python -m scripts.wow_professions.trainer_npc_recipes

Writes ``frontend/src/games/wow-forever/data/professions/crafting/classic/trainerNpcSpells.json``:

    {
      "source": "cmangos/classic-db@<commit>",
      "enchanting": {
        "1317": [[7422, 15, 50], [7441, 45, 100], ...],  // [spell, forever_skill, cost_copper]
        ...
      },
      ...
    }

Format per trainer: list of [spell_id, forever_learn_skill, cost_in_copper], sorted by skill.
Only spells that appear in ``trainerSkills.json`` for that profession are included; others are
silently skipped (they are rank-up spells, not recipe spells the crafting guide lists).

This is a separate pipeline step from ``wow_professions.build`` — do NOT edit ``build_recipes``
or regenerate the per-profession crafting JSON as part of this run.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from scripts.wow_food.build import EFFECT_LEARN_SPELL
from scripts.wow_professions.crafts import (
    ALCHEMY_SKILL_LINE,
    BLACKSMITHING_SKILL_LINE,
    ENCHANTING_SKILL_LINE,
    ENGINEERING_SKILL_LINE,
    FIRST_AID_SKILL_LINE,
    LEATHERWORKING_SKILL_LINE,
    TAILORING_SKILL_LINE,
)
from scripts.wow_world_map.build import write_json
from scripts.wow_world_map.sources import (
    CMANGOS_COMMIT,
    WAGO_ERA_BRANCH,
    WAGO_ERA_BUILD,
    cmangos_dump,
    wago_table,
)
from scripts.wow_world_map.sql_dump import read_dump

DATA_DIR = Path(__file__).parents[3] / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting" / "classic"

PROFESSIONS: dict[str, int] = {
    "tailoring": TAILORING_SKILL_LINE,
    "enchanting": ENCHANTING_SKILL_LINE,
    "alchemy": ALCHEMY_SKILL_LINE,
    "blacksmithing": BLACKSMITHING_SKILL_LINE,
    "leatherworking": LEATHERWORKING_SKILL_LINE,
    "engineering": ENGINEERING_SKILL_LINE,
    "firstaid": FIRST_AID_SKILL_LINE,
}


def _int(value: object) -> int:
    try:
        return int(float(str(value or 0)))
    except (ValueError, TypeError):
        return 0


def _load_teaches() -> dict[int, list[int]]:
    """Teaching spell -> [recipe spells it teaches], from the Classic Era client's EFFECT_LEARN_SPELL."""
    out: dict[int, list[int]] = defaultdict(list)
    for r in wago_table("SpellEffect", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL:
            out[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))
    return out


def _load_template_map(creature_rows: list[dict]) -> dict[int, list[int]]:
    """trainer template id -> [NPC entry ids that use it]."""
    out: dict[int, list[int]] = defaultdict(list)
    for r in creature_rows:
        template_id = _int(r.get("TrainerTemplateId", 0))
        if template_id:
            out[template_id].append(_int(r["Entry"]))
    return out


def build_npc_spells(
    skill_line: int,
    npc_trainer_rows: list[dict],
    npc_trainer_template_rows: list[dict],
    template_to_npcs: dict[int, list[int]],
    teaches: dict[int, list[int]],
    forever_skills: dict[int, int],
    trainer_costs: dict[int, int],
) -> dict[int, dict[int, int]]:
    """NPC entry id -> {recipe_spell: forever_skill}.

    ``trainer_costs`` accumulates: recipe_spell -> cost_in_copper (smallest non-zero seen).
    """
    npc_spells: dict[int, dict[int, int]] = defaultdict(dict)

    def _add(npc_id: int, trainer_spell: int, cost: int) -> None:
        for recipe in [trainer_spell, *teaches.get(trainer_spell, [])]:
            if recipe not in forever_skills:
                continue
            skill = forever_skills[recipe]
            npc_spells[npc_id].setdefault(recipe, skill)
            if cost:
                existing = trainer_costs.get(recipe, 0)
                trainer_costs[recipe] = min(cost, existing) if existing else cost

    for r in npc_trainer_rows:
        if _int(r.get("reqskill", 0)) != skill_line:
            continue
        _add(_int(r["entry"]), _int(r["spell"]), _int(r["spellcost"]))

    for r in npc_trainer_template_rows:
        if _int(r.get("reqskill", 0)) != skill_line:
            continue
        template_id = _int(r["entry"])
        for npc_id in template_to_npcs.get(template_id, []):
            _add(npc_id, _int(r["spell"]), _int(r["spellcost"]))

    return dict(npc_spells)


def main() -> None:
    teaches = _load_teaches()
    db_rows = read_dump(cmangos_dump(), {"npc_trainer", "npc_trainer_template", "creature_template"})
    template_to_npcs = _load_template_map(db_rows["creature_template"])

    # trainer_costs accumulates the cheapest cost seen for each recipe spell across all trainers.
    trainer_costs: dict[int, int] = {}
    with (DATA_DIR / "trainerSkills.json").open(encoding="utf-8") as f:
        trainer_skills_data = json.load(f)

    result: dict[str, dict[str, list[list[int]]]] = {}
    for prof_name, skill_line in PROFESSIONS.items():
        # forever_skills: recipe spell -> forever-adjusted learn skill, read from the
        # already-generated trainerSkills.json (build.py applies the adjustment).
        prof_skills: dict[str, dict[str, int]] = trainer_skills_data.get(prof_name, {})
        forever_skills: dict[int, int] = {int(k): v["forever"] for k, v in prof_skills.items()}

        npc_spells = build_npc_spells(
            skill_line,
            db_rows["npc_trainer"],
            db_rows["npc_trainer_template"],
            template_to_npcs,
            teaches,
            forever_skills,
            trainer_costs,
        )

        # Serialize: {npcId_str: [[spell, forever_skill, cost], ...] sorted by forever_skill}
        serialized: dict[str, list[list[int]]] = {}
        for npc_id, spell_skills in sorted(npc_spells.items()):
            rows = sorted(
                ([spell, skill, trainer_costs.get(spell, 0)] for spell, skill in spell_skills.items()),
                key=lambda row: (row[1], row[0]),
            )
            if rows:
                serialized[str(npc_id)] = rows
        result[prof_name] = serialized

    write_json(DATA_DIR / "trainerNpcSpells.json", {
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        **result,
    })

    # Print a summary.
    for prof_name, npcs in result.items():
        total_recipes = sum(len(v) for v in npcs.values())
        print(f"{prof_name}: {len(npcs)} NPCs, {total_recipes} trainer-recipe pairs")


if __name__ == "__main__":
    main()
