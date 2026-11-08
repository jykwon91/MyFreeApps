"""How Classic teaches a class spell: its trainer cost, a quest, or a book (pure).

Trainers and quests are server-side, so the Forever client has neither. Both
come from cmangos classic-db: ``npc_trainer`` / ``npc_trainer_template``
(``spellcost`` in copper) and ``quest_template`` (``RewSpell`` /
``RewSpellCast``) and ``item_template`` (class books — Dire Maul's
Codex / Book / Tome, Ahn'Qiraj's rank tomes). cmangos often lists the *teaching* spell rather than the
spell itself; the Classic Era client's LEARN_SPELL effect says which spell it
teaches, so both are counted. Matched by spell id only — a rank Forever
re-numbered or added has no Classic cost, and none is borrowed from another id.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping

from scripts.wow_world_map.sql_dump import SqlValue

Row = Mapping[str, str]
SqlRow = Mapping[str, SqlValue]

EFFECT_LEARN_SPELL = 36
ITEM_CLASS_RECIPE = 9
ITEM_SUBCLASS_BOOK = 0
ITEM_SPELL_SLOTS = 5


def _int(value: SqlValue | str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def teaching_map(era_effects: Iterable[Row]) -> dict[int, list[int]]:
    """Teaching spell -> the spells its LEARN_SPELL effects teach (Classic Era ``SpellEffect``)."""
    teaches: dict[int, list[int]] = defaultdict(list)
    for r in era_effects:
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL and _int(r["EffectTriggerSpell"]):
            teaches[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))
    return dict(teaches)


def _taught(spell: int, teaches: Mapping[int, list[int]]) -> list[int]:
    return [spell, *teaches.get(spell, [])]


def trainer_costs(trainer_rows: Iterable[SqlRow], teaches: Mapping[int, list[int]]) -> dict[int, int]:
    """Spell -> the lowest cost (copper) a Classic trainer asks to teach it.

    Profession and riding trainers sit in the same tables; their rows name a
    required skill, so only rows with no ``reqskill`` (class trainers) count.
    """
    costs: dict[int, int] = {}
    for row in trainer_rows:
        if _int(row.get("reqskill")):
            continue
        cost = _int(row.get("spellcost"))
        for spell in _taught(_int(row["spell"]), teaches):
            costs[spell] = min(cost, costs.get(spell, cost))
    return costs


def quest_spells(quests: Iterable[SqlRow], teaches: Mapping[int, list[int]]) -> set[int]:
    """Spells a Classic quest teaches as its reward."""
    out: set[int] = set()
    for row in quests:
        for column in ("RewSpell", "RewSpellCast"):
            if spell := _int(row.get(column)):
                out.update(_taught(spell, teaches))
    return out


def book_spells(items: Iterable[SqlRow], teaches: Mapping[int, list[int]]) -> set[int]:
    """Spells a Classic class book teaches (``item_template`` recipe class, book subclass)."""
    out: set[int] = set()
    for row in items:
        if _int(row.get("class")) != ITEM_CLASS_RECIPE or _int(row.get("subclass")) != ITEM_SUBCLASS_BOOK:
            continue
        for slot in range(1, ITEM_SPELL_SLOTS + 1):
            if spell := _int(row.get(f"spellid_{slot}")):
                out.update(teaches.get(spell, []))
    return out
