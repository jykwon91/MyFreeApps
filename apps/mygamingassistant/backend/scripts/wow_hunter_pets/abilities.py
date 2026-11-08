"""Hunter pet abilities and their ranks, for ``/wow-forever/hunter-pets`` (pure).

An ability is every spell of one name on the pet families' skill lines — each
family's own line (Bite, Claw, Dash, Dive, Charge, Prowl...) and the generic
pet line 270 (Growl, Cower, Great Stamina, Natural Armor, the resistances).
A rank is one such spell: its learn level is ``SpellLevels.SpellLevel`` and the
families that can learn it are the lines that list it (Dive's first rank is
Bird of Prey / Wind Serpent / Carrion Bird only; its later ranks add Bat).

Left out: spells the pet is simply given (``AcquireMethod`` 2: the family's
passive), spells with no learn level, the obsolete Pet Aggression / Hardiness /
Recovery / Resistance, the level-1 "Faster / Slower Attack" scaling spells and
"Summoning". An ability or a rank no Classic Era skill line lists is "new in
Forever".
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from scripts.wow_hunter_pets.families import GENERIC_SKILL_LINE, GIVEN_ACQUIRE_METHOD, slugify

Row = Mapping[str, str]

EXCLUDED_NAMES = re.compile(
    r"^(Pet (Aggression|Hardiness|Recovery|Resistance)|Summoning|(Faster|Slower) Attack\b|Hunter Pet Scaling|Tamed Pet Passive)",
)


@dataclass(frozen=True)
class Rank:
    spell: int
    level: int
    lines: frozenset[int]
    is_new: bool


@dataclass(frozen=True)
class Ability:
    name: str
    slug: str
    ranks: list[Rank]
    lines: frozenset[int]
    is_new: bool


def build_abilities(
    ability_rows: Iterable[Row],
    pet_lines: Iterable[int],
    levels: Mapping[int, int],
    names: Mapping[int, str],
    classic_spells: set[int],
) -> list[Ability]:
    """Every learnable pet ability, by name, its ranks lowest level first."""
    lines = set(pet_lines) | {GENERIC_SKILL_LINE}
    spell_lines: dict[int, set[int]] = defaultdict(set)
    for r in ability_rows:
        spell = int(r["Spell"])
        if int(r["SkillLine"]) not in lines or r["AcquireMethod"] == GIVEN_ACQUIRE_METHOD:
            continue
        name = names.get(spell, "")
        if not name or EXCLUDED_NAMES.match(name) or levels.get(spell, 0) <= 0:
            continue
        spell_lines[spell].add(int(r["SkillLine"]))
    by_name: dict[str, list[int]] = defaultdict(list)
    for spell in spell_lines:
        by_name[names[spell]].append(spell)
    out: list[Ability] = []
    for name, spells in by_name.items():
        ranks = [
            Rank(s, levels[s], frozenset(spell_lines[s]), s not in classic_spells)
            for s in sorted(spells, key=lambda s: (levels[s], s))
        ]
        out.append(Ability(
            name=name,
            slug=slugify(name),
            ranks=ranks,
            lines=frozenset().union(*(r.lines for r in ranks)),
            is_new=all(r.is_new for r in ranks),
        ))
    return sorted(out, key=lambda a: a.name)
