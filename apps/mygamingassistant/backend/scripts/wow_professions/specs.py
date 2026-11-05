"""Crafting specializations: which recipes need one, and the Classic quest that teaches it.

A specialization is a spell in the profession's ``SkillLineAbility`` rows
(Armorsmith, Gnomish Engineer, ...). Two things tie a recipe to one:

* **Forever client**: the Plans / Pattern / Schematic item that teaches it
  asks for the spell (``ItemSparse.RequiredAbility``).
* **Classic server**: a recipe only a specialist trainer teaches. The trainer
  is the NPC who gives that specialization's quest (cmangos
  ``creature_questrelation`` + ``quest_template.RewSpell``), so a recipe
  taught only by such NPCs belongs to their specialization.

The quests themselves are Classic too (cmangos classic-db, GPL-3.0).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from scripts.wow_world_map.sources import WAGO_ERA_BRANCH, WAGO_ERA_BUILD, cmangos_dump, wago_table
from scripts.wow_world_map.sql_dump import read_dump

EFFECT_LEARN_SPELL = 36
QUEST_ITEM_SLOTS = 4

# Profession skill line -> its specialization spells (client SkillLineAbility rows with no skill colours).
SPECIALIZATIONS: dict[int, tuple[int, ...]] = {
    164: (9788, 9787, 17041, 17040, 17039),  # Armorsmith, Weaponsmith, Master Axe/Hammer/Swordsmith
    165: (10656, 10658, 10660),  # Dragonscale, Elemental, Tribal Leatherworking
    202: (20219, 20222),  # Gnomish, Goblin Engineer
}


def _int(value: object) -> int:
    try:
        return int(float(str(value or 0)))
    except ValueError:
        return 0


@dataclass(frozen=True)
class SpecQuest:
    """A Classic quest that teaches a specialization."""

    quest: int
    spec: int
    skill: int
    level: int
    # (item, count) to hand in
    items: list[tuple[int, int]]
    givers: list[int]


def _teaching_spells(specs: set[int]) -> dict[int, int]:
    """Classic Era spell that teaches a specialization -> the specialization (quests reward the teaching spell)."""
    out = {s: s for s in specs}
    for r in wago_table("SpellEffect", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL and _int(r["EffectTriggerSpell"]) in specs:
            out[_int(r["SpellID"])] = _int(r["EffectTriggerSpell"])
    return out


def spec_quests(skill_line: int) -> list[SpecQuest]:
    """Every Classic quest that rewards one of the profession's specializations, by quest id."""
    teaching = _teaching_spells(set(SPECIALIZATIONS.get(skill_line, ())))
    t = read_dump(cmangos_dump(), {"quest_template", "creature_questrelation"})
    givers: dict[int, list[int]] = defaultdict(list)
    for r in t["creature_questrelation"]:
        givers[_int(r["quest"])].append(_int(r["id"]))
    out = []
    for q in t["quest_template"]:
        spec = teaching.get(_int(q["RewSpell"]) or _int(q["RewSpellCast"]))
        if spec is None:
            continue
        items = [(_int(q[f"ReqItemId{i}"]), _int(q[f"ReqItemCount{i}"])) for i in range(1, QUEST_ITEM_SLOTS + 1)]
        out.append(SpecQuest(
            quest=_int(q["entry"]), spec=spec, skill=_int(q["RequiredSkillValue"]), level=_int(q["MinLevel"]),
            items=[(i, n) for i, n in items if i], givers=sorted(givers.get(_int(q["entry"]), [])),
        ))
    return sorted(out, key=lambda q: q.quest)


def spec_records(skill_line: int, quests: list[SpecQuest], item_names: dict[int, str]) -> list[dict]:
    """The profession's specializations for the page: Forever client name, and the Classic quests that teach each."""
    names = {_int(r["ID"]): r["Name_lang"].strip() for r in wago_table("SpellName")}
    out = []
    for spec in SPECIALIZATIONS.get(skill_line, ()):
        out.append({
            "spell": spec,
            "name": names.get(spec, f"Spell {spec}"),
            "quests": [
                {
                    "id": q.quest,
                    "skill": q.skill,
                    "level": q.level,
                    "items": [{"id": i, "name": item_names.get(i, f"Item {i}"), "count": n} for i, n in q.items],
                }
                for q in quests
                if q.spec == spec
            ],
        })
    return out


def trainer_specs(skill_line: int, quests: list[SpecQuest]) -> dict[int, int]:
    """Recipe spell -> specialization, for recipes only that specialization's trainers teach (Classic)."""
    spec_of_npc = {npc: q.spec for q in quests for npc in q.givers}
    teaches: dict[int, list[int]] = defaultdict(list)
    for r in wago_table("SpellEffect", branch=WAGO_ERA_BRANCH, build=WAGO_ERA_BUILD):
        if _int(r["Effect"]) == EFFECT_LEARN_SPELL:
            teaches[_int(r["SpellID"])].append(_int(r["EffectTriggerSpell"]))
    t = read_dump(cmangos_dump(), {"npc_trainer", "npc_trainer_template", "creature_template"})
    by_template: dict[int, list[int]] = defaultdict(list)
    for npc in t["creature_template"]:
        if _int(npc["TrainerTemplateId"]):
            by_template[_int(npc["TrainerTemplateId"])].append(_int(npc["Entry"]))
    taught_by: dict[int, set[int]] = defaultdict(set)
    rows = [(r, [_int(r["entry"])]) for r in t["npc_trainer"]]
    rows += [(r, by_template[_int(r["entry"])]) for r in t["npc_trainer_template"]]
    for r, npcs in rows:
        if _int(r["reqskill"]) != skill_line:
            continue
        for recipe in teaches.get(_int(r["spell"]), [_int(r["spell"])]):
            taught_by[recipe].update(npcs)
    # Other specialist trainers give no quest (Orgrimmar has two of each): an NPC
    # teaching only what one specialization's quest givers teach is that specialization's.
    teaches_npc: dict[int, set[int]] = defaultdict(set)
    for recipe, npcs in taught_by.items():
        for npc in npcs:
            teaches_npc[npc].add(recipe)
    giver_recipes: dict[int, set[int]] = defaultdict(set)
    for npc, spec in spec_of_npc.items():
        giver_recipes[spec] |= teaches_npc.get(npc, set())
    for npc, recipes in teaches_npc.items():
        if npc in spec_of_npc:
            continue
        fits = [spec for spec, taught in giver_recipes.items() if recipes <= taught]
        if len(fits) == 1:
            spec_of_npc[npc] = fits[0]
    out: dict[int, int] = {}
    for recipe, npcs in taught_by.items():
        specs = {spec_of_npc.get(n) for n in npcs}
        if len(specs) == 1 and (spec := specs.pop()) is not None:
            out[recipe] = spec
    return dict(sorted(out.items()))
