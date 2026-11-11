"""The Warlock's demons and what each learns at which level (pure).

A demon is one of ``wow_macros.build.PET_LINES["warlock"]`` (the game's
"Pet - Imp" skill lines); its abilities are the spells that line teaches, one
per name, ranks lowest level first. A rank's level is ``SpellLevels`` — the
level its Grimoire asks of the Warlock. ``known`` marks a rank the demon has
when summoned (``AcquireMethod`` 2); ``grimoire`` is the Forever item that
teaches the rest ("Grimoire of Firebolt (Rank 2)"), sold by Demon trainers.

Left out: the lines' passives and scaling spells (hidden, or no level), and a
spell's "Effect" half (Devour Magic Effect is what the dispel casts).
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any

from scripts.wow_macros.build import PET_LINES
from scripts.wow_spellbook.spells import ACQUIRE_ON_LEARN, ATTR0_HIDDEN, SpellFacts, rank_number

Row = Mapping[str, str]

DEMON_LINES: dict[int, str] = {line: name.removeprefix("Pet - ") for line, name in PET_LINES["warlock"].items()}
_LEFT_OUT = re.compile(r"(^Tamed Pet Passive|^Warlock Pet Scaling| Effect$)")
_GRIMOIRE = re.compile(r"^Grimoire of (.+?)(?: \((Rank \d+)\))?$")


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def grimoire_items(items: Iterable[Row]) -> dict[tuple[str, str], int]:
    """(ability, "Rank N" or "") -> the Grimoire item that teaches it."""
    found: dict[tuple[str, str], int] = {}
    for item in items:
        match = _GRIMOIRE.match((item.get("Display_lang") or "").strip())
        if match:
            found.setdefault((match.group(1), match.group(2) or ""), _int(item["ID"]))
    return found


def demon_docs(
    abilities: Iterable[Row],
    facts: SpellFacts,
    grimoires: Mapping[tuple[str, str], int],
    text: Mapping[int, str | None],
) -> list[dict[str, Any]]:
    """Each demon, in skill-line order, with its abilities by first learn level."""
    by_line: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    seen: set[int] = set()
    for row in abilities:
        line, spell = _int(row["SkillLine"]), _int(row["Spell"])
        name = (facts.names.get(spell) or "").strip()
        level = facts.levels.get(spell)
        if line not in DEMON_LINES or spell in seen or not name or not level:
            continue
        if _LEFT_OUT.search(name) or facts.attributes.get(spell, 0) & ATTR0_HIDDEN:
            continue
        seen.add(spell)
        subtext = facts.subtexts.get(spell, "").strip()
        rank_label = subtext if rank_number(subtext) else ""
        rank: dict[str, Any] = {"spell": spell, "level": level}
        if rank_label:
            rank["rank"] = rank_label
        if spell_text := text.get(spell):
            rank["text"] = spell_text
        if _int(row.get("AcquireMethod")) == ACQUIRE_ON_LEARN:
            rank["known"] = True
        elif (item := grimoires.get((name, rank_label))) is not None:
            rank["grimoire"] = item
        by_line[line][name].append(rank)
    demons = []
    for line, demon in DEMON_LINES.items():
        docs = []
        for name, ranks in by_line[line].items():
            ranks.sort(key=lambda r: r["level"])
            docs.append({"name": name, "icon": facts.icons.get(ranks[0]["spell"], 0), "ranks": ranks})
        docs.sort(key=lambda a: (a["ranks"][0]["level"], a["name"]))
        demons.append({"line": line, "name": demon, "abilities": docs})
    return demons
