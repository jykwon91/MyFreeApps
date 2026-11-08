"""Hunter pet families, for ``/wow-forever/hunter-pets`` (pure).

Everything here is read from the Forever client's tables (``CreatureFamily``,
``ItemPetFood``, the family's skill line and the passive spell on it):

* the diet is ``CreatureFamily.PetFoodMask`` — bit ``n`` is ``ItemPetFood`` id ``n + 1``;
* the damage / armor / health modifiers are the base points of the family's
  own "Tamed Pet Passive" spell: the damage-done aura (79, physical), the base
  armor aura (142, physical) and the max-health aura (133), each in percent.
  The Classic Era client zeroes all of them (the server held them); the
  Forever client ships them, so they are "Game files" facts. A family whose
  passive the client doesn't have (Fox) has no modifiers — never guessed.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

Row = Mapping[str, str]

# The Classic hunter's tamable beast families (CreatureFamily ids). A family the Forever
# client has and the Classic Era client doesn't (Fox) is added by ``hunter_families``.
CLASSIC_FAMILY_IDS = frozenset({1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 20, 21, 24, 25, 26, 27})
# Every hunter pet shares this skill line (Growl, Cower, Great Stamina, resistances...).
GENERIC_SKILL_LINE = 270
# SkillLineAbility.AcquireMethod of a spell the pet is simply given.
GIVEN_ACQUIRE_METHOD = "2"

AURA_DAMAGE_DONE = "79"
AURA_BASE_ARMOR = "142"
AURA_MAX_HEALTH = "133"
PHYSICAL_SCHOOL = "1"


@dataclass(frozen=True)
class Family:
    id: int
    slug: str
    name: str
    icon: int
    diet: list[str]
    skill_line: int
    is_new: bool
    damage: int | None
    armor: int | None
    health: int | None


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def diet_names(mask: int, foods: Iterable[Row]) -> list[str]:
    """The foods a family eats: bit ``n`` of the mask is ``ItemPetFood`` id ``n + 1``."""
    return [f["Name_lang"] for f in sorted(foods, key=lambda f: int(f["ID"])) if mask & (1 << (int(f["ID"]) - 1))]


def hunter_families(forever: Iterable[Row], classic_ids: set[int]) -> list[Row]:
    """The Forever client's tamable families: the Classic list, plus any family new to the client."""
    return sorted(
        (
            r for r in forever
            if int(r["ID"]) in CLASSIC_FAMILY_IDS
            or (int(r["ID"]) not in classic_ids and int(r["SkillLine_1"]) == GENERIC_SKILL_LINE)
        ),
        key=lambda r: r["Name_lang"],
    )


def family_passives(
    ability_rows: Iterable[Row], family_lines: Iterable[int],
) -> dict[int, int]:
    """Skill line -> the passive spell given to that family's line.

    The passives every family is given (stats, scaling) sit on all the lines; a family's own
    sits on its line alone — or on two when the client reuses it (Fox is given the Wolf's).
    A line with two such candidates is a data surprise worth stopping for.
    """
    lines = set(family_lines)
    given: dict[str, set[int]] = defaultdict(set)
    for r in ability_rows:
        line = int(r["SkillLine"])
        if line in lines and r["AcquireMethod"] == GIVEN_ACQUIRE_METHOD:
            given[r["Spell"]].add(line)
    out: dict[int, int] = {}
    for spell, found in given.items():
        if found == lines:
            continue
        for line in found:
            if line in out:
                raise ValueError(f"skill line {line} is given two family passives: {out[line]} and {spell}")
            out[line] = int(spell)
    return out


def passive_modifiers(effect_rows: Iterable[Row], spell: int) -> tuple[int, int, int] | None:
    """(damage, armor, health) percent of a family passive; None when the client has no such effects."""
    found: dict[str, int] = {}
    for e in effect_rows:
        if e["SpellID"] != str(spell):
            continue
        percent = round(float(e["EffectBasePointsF"] or 0))
        if e["EffectAura"] == AURA_DAMAGE_DONE and e["EffectMiscValue_0"] == PHYSICAL_SCHOOL:
            found["damage"] = percent
        elif e["EffectAura"] == AURA_BASE_ARMOR and e["EffectMiscValue_0"] == PHYSICAL_SCHOOL:
            found["armor"] = percent
        elif e["EffectAura"] == AURA_MAX_HEALTH:
            found["health"] = percent
    if len(found) != 3:
        return None
    return found["damage"], found["armor"], found["health"]


def build_families(
    forever: Iterable[Row],
    classic_ids: set[int],
    foods: Iterable[Row],
    ability_rows: Iterable[Row],
    effect_rows: Iterable[Row],
) -> list[Family]:
    chosen = hunter_families(forever, classic_ids)
    food_rows = list(foods)
    effects = list(effect_rows)
    passives = family_passives(ability_rows, (int(r["SkillLine_0"]) for r in chosen))
    out: list[Family] = []
    for r in chosen:
        line = int(r["SkillLine_0"])
        modifiers = passive_modifiers(effects, passives[line]) if line in passives else None
        out.append(Family(
            id=int(r["ID"]),
            slug=slugify(r["Name_lang"]),
            name=r["Name_lang"],
            icon=int(r["IconFileID"] or 0),
            diet=diet_names(int(r["PetFoodMask"]), food_rows),
            skill_line=line,
            is_new=int(r["ID"]) not in classic_ids,
            damage=modifiers[0] if modifiers else None,
            armor=modifiers[1] if modifiers else None,
            health=modifiers[2] if modifiers else None,
        ))
    return out
