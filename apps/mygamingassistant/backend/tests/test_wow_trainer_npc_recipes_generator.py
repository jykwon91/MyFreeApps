"""Per-trainer NPC recipe lists — generator pure steps and committed output."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from scripts.wow_professions.trainer_npc_recipes import (
    _int,
    build_npc_spells,
)

CLASSIC_DIR = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting" / "classic"
)
COMMITTED: dict = json.loads((CLASSIC_DIR / "trainerNpcSpells.json").read_text(encoding="utf-8"))

ENCHANTING_SKILL_LINE = 333  # same as crafts.py

# Minimal fixture: two direct rows (NPC 10, NPC 11) and one template row via NPC 20.
_NPC_TRAINER = [
    {"entry": 10, "spell": 1001, "spellcost": 100, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0},
    {"entry": 11, "spell": 1002, "spellcost": 200, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0},
    {"entry": 10, "spell": 9999, "spellcost": 50, "reqskill": 0, "reqskillvalue": 0},  # wrong profession — skip
]
_NPC_TRAINER_TEMPLATE = [
    {"entry": 5, "spell": 1003, "spellcost": 300, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0},
]
_TEMPLATE_TO_NPCS = {5: [20, 21]}
_FOREVER_SKILLS = {1001: 15, 1002: 45, 1003: 75}
_TEACHES: dict[int, list[int]] = {}


def test_int_handles_floats_and_none() -> None:
    assert _int("1.0") == 1
    assert _int(None) == 0
    assert _int("") == 0


def test_build_npc_spells_direct_entries() -> None:
    costs: dict[int, int] = {}
    result = build_npc_spells(
        ENCHANTING_SKILL_LINE,
        _NPC_TRAINER,
        [],
        {},
        _TEACHES,
        _FOREVER_SKILLS,
        costs,
    )
    assert 10 in result
    assert 11 in result
    assert result[10] == {1001: 15}
    assert result[11] == {1002: 45}
    # Spell for wrong profession not included
    assert 1 not in result.get(10, {})


def test_build_npc_spells_template_entries() -> None:
    costs: dict[int, int] = {}
    result = build_npc_spells(
        ENCHANTING_SKILL_LINE,
        [],
        _NPC_TRAINER_TEMPLATE,
        _TEMPLATE_TO_NPCS,
        _TEACHES,
        _FOREVER_SKILLS,
        costs,
    )
    assert 20 in result and 21 in result
    assert result[20] == {1003: 75}
    assert result[21] == {1003: 75}


def test_build_npc_spells_teaches_resolution() -> None:
    # Teaching spell 2000 teaches recipe spell 1001.
    teaches = {2000: [1001]}
    npc_trainer_with_teaching = [
        {"entry": 50, "spell": 2000, "spellcost": 100, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0},
    ]
    costs: dict[int, int] = {}
    result = build_npc_spells(
        ENCHANTING_SKILL_LINE, npc_trainer_with_teaching, [], {}, teaches, _FOREVER_SKILLS, costs,
    )
    # The teaching spell itself is not in forever_skills, but the taught recipe is.
    assert result[50] == {1001: 15}


def test_build_npc_spells_accumulates_minimum_cost() -> None:
    cheap = [{"entry": 10, "spell": 1001, "spellcost": 50, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0}]
    expensive = [{"entry": 11, "spell": 1001, "spellcost": 200, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0}]
    costs: dict[int, int] = {}
    build_npc_spells(ENCHANTING_SKILL_LINE, cheap, [], {}, {}, _FOREVER_SKILLS, costs)
    build_npc_spells(ENCHANTING_SKILL_LINE, expensive, [], {}, {}, _FOREVER_SKILLS, costs)
    assert costs[1001] == 50  # cheapest wins


def test_build_npc_spells_skips_spells_not_in_forever_skills() -> None:
    rows = [{"entry": 99, "spell": 9876, "spellcost": 100, "reqskill": ENCHANTING_SKILL_LINE, "reqskillvalue": 0}]
    costs: dict[int, int] = {}
    result = build_npc_spells(ENCHANTING_SKILL_LINE, rows, [], {}, {}, _FOREVER_SKILLS, costs)
    # Spell 9876 not in forever_skills, so NPC 99 gets nothing.
    assert result.get(99, {}) == {}


# ----- Committed output checks -----


def test_committed_file_has_all_seven_professions() -> None:
    for prof in ("tailoring", "enchanting", "alchemy", "blacksmithing", "leatherworking", "engineering", "firstaid"):
        assert prof in COMMITTED, f"missing {prof}"


def test_committed_tuples_are_always_three_elements() -> None:
    for prof, npcs in COMMITTED.items():
        if prof == "source":
            continue
        for npc_id, tuples in npcs.items():
            for tup in tuples:
                assert len(tup) == 3, f"{prof}/{npc_id}: tuple {tup!r} has {len(tup)} elements"


def test_committed_tuples_are_sorted_by_skill() -> None:
    for prof, npcs in COMMITTED.items():
        if prof == "source":
            continue
        for npc_id, tuples in npcs.items():
            skills = [t[1] for t in tuples]
            assert skills == sorted(skills), f"{prof}/{npc_id}: not sorted by skill"


def test_committed_enchanting_lucan_cordell() -> None:
    # NPC 1317 = Lucan Cordell, Stormwind enchanting trainer (Alliance, Journeyman rank).
    lucan = COMMITTED.get("enchanting", {}).get("1317", [])
    assert len(lucan) > 0, "Lucan Cordell (1317) should have enchanting recipes"
    # Skill range should be apprentice/journeyman only (up to ~150).
    max_skill = max(t[1] for t in lucan)
    assert max_skill <= 150, f"Lucan should be a Journeyman trainer, max skill {max_skill}"
    # Should have a training cost for at least one recipe.
    has_cost = any(t[2] > 0 for t in lucan)
    assert has_cost, "At least one recipe should have a non-zero cost"


def test_committed_enchanting_artisan_trainer_has_most_recipes() -> None:
    enc = COMMITTED.get("enchanting", {})
    recipe_counts = {npc: len(tuples) for npc, tuples in enc.items()}
    max_count = max(recipe_counts.values())
    max_npc = max(recipe_counts, key=recipe_counts.get)  # type: ignore[arg-type]
    # The artisan trainer should have more recipes than any journeyman trainer.
    assert max_count >= 50, f"Artisan enchanting trainer ({max_npc}) should teach 50+ recipes"


def test_committed_firstaid_has_fewer_recipes_than_tailoring() -> None:
    fa_total = sum(len(v) for v in COMMITTED.get("firstaid", {}).values())
    tail_total = sum(len(v) for v in COMMITTED.get("tailoring", {}).values())
    assert fa_total < tail_total, "First Aid should have far fewer recipes than Tailoring"


def test_committed_source_is_cmangos() -> None:
    assert COMMITTED["source"].startswith("cmangos/classic-db@")
