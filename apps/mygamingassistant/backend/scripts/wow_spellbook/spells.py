"""Each class's trainable spells from the Forever client's tables (pure).

Scope: the spells a class's own skill lines teach (``SkillLineAbility`` on
``wow_macros.build.CLASS_LINES`` — the game's spell tabs), as in the Changes
feed. Left out:

* the copies the game grants another way (``AcquireMethod`` 3 — Season of
  Discovery runes);
* spells the spellbook never shows (``SpellMisc.Attributes_0`` "do not
  display") and passive talent ranks (the talent calculator covers them);
* spells the client has no row or name for (counted, never guessed);
* Classic spells nothing teaches: a spell 1.12 has (cmangos ``spell_template``
  — not the Classic Era client, which also carries Season of Discovery's ids)
  is kept only when a Classic trainer, quest or class book teaches it, a talent grants
  it, or the game gives it when the line is learned (``AcquireMethod`` 2). That
  drops proc effects and talent auras (Pyroclasm's stun, Master
  Demonologist's buffs) that sit in the same lines. A spell new in Forever
  is kept when the client gives it a level, or a talent grants it.

A spell is one class + name; its ranks are the "Rank N" spells under it.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from scripts.wow_macros.build import PLACEHOLDER
from scripts.wow_talents.talents import rank_spells

Row = Mapping[str, str]

ACQUIRE_ON_LEARN = 2
ACQUIRE_OTHER_WAY = 3
ATTR0_PASSIVE = 0x40
ATTR0_HIDDEN = 0x80
# RaceMasks_0 bits -> the race's id (ChrRaces), Classic's eight races.
RACE_BITS: dict[int, int] = {1: 1, 2: 2, 4: 3, 8: 4, 16: 5, 32: 6, 64: 7, 128: 8}
ALL_RACES = frozenset(RACE_BITS.values())
_RANK = re.compile(r"^Rank (\d+)$")


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def rank_number(subtext: str) -> int:
    """``Rank 3`` -> 3; anything else (``Summon``, ``Shapeshift``, none) -> 0."""
    found = _RANK.match((subtext or "").strip())
    return int(found.group(1)) if found else 0


def races_of(mask: int) -> frozenset[int]:
    """The races a ``RaceMasks_0`` allows; 0 or -1 (every race) -> all of them."""
    if mask in (0, -1):
        return ALL_RACES
    return frozenset(race for bit, race in RACE_BITS.items() if mask & bit)


@dataclass(frozen=True)
class SpellFacts:
    """The client columns a rank needs, keyed by spell id."""

    names: Mapping[int, str]
    subtexts: Mapping[int, str]
    attributes: Mapping[int, int]
    levels: Mapping[int, int]
    icons: Mapping[int, int]

    @classmethod
    def from_tables(cls, tables: Mapping[str, Iterable[Row]]) -> "SpellFacts":
        base = {name: [r for r in tables[name] if _int(r.get("DifficultyID")) == 0] for name in ("SpellMisc", "SpellLevels")}
        return cls(
            names={_int(r["ID"]): r["Name_lang"] for r in tables["SpellName"]},
            subtexts={_int(r["ID"]): r.get("NameSubtext_lang") or "" for r in tables["Spell"]},
            attributes={_int(r["SpellID"]): _int(r["Attributes_0"]) for r in base["SpellMisc"]},
            levels={_int(r["SpellID"]): _int(r["SpellLevel"]) for r in base["SpellLevels"] if _int(r["SpellLevel"]) > 0},
            icons={_int(r["SpellID"]): _int(r["SpellIconFileDataID"]) for r in base["SpellMisc"] if _int(r["SpellIconFileDataID"])},
        )


@dataclass(frozen=True)
class Learned:
    """How Classic teaches a spell (cmangos), and what Forever's talents grant."""

    trainer: frozenset[int] = frozenset()
    quest: frozenset[int] = frozenset()
    book: frozenset[int] = frozenset()
    # Talent rank spell -> the live talent it belongs to (``talent_spells``); None when the live trees dropped it.
    talent_of: Mapping[int, int | None] = field(default_factory=dict)


@dataclass(frozen=True)
class Rank:
    spell: int
    rank: str
    level: int | None
    passive: bool
    from_talent: bool


@dataclass(frozen=True)
class Spell:
    class_id: str
    name: str
    tab: int
    ranks: tuple[Rank, ...]
    races: frozenset[int]
    talent: int | None
    icon: int


@dataclass
class SpellGaps:
    """What the client couldn't give, for the run's report."""

    not_in_client: list[int] = field(default_factory=list)
    untaught: list[int] = field(default_factory=list)


def _keep(
    spell: int,
    acquire: int,
    facts: SpellFacts,
    classic_ids: frozenset[int],
    learned: Learned,
    gaps: SpellGaps,
) -> bool:
    if acquire == ACQUIRE_OTHER_WAY:
        return False
    name = (facts.names.get(spell) or "").strip()
    if spell not in facts.subtexts or not name:
        gaps.not_in_client.append(spell)
        return False
    if PLACEHOLDER.search(name):
        return False
    attributes = facts.attributes.get(spell, 0)
    if attributes & ATTR0_HIDDEN:
        return False
    is_talent = spell in learned.talent_of
    if is_talent and attributes & ATTR0_PASSIVE:
        return False
    if spell in classic_ids:
        taught = spell in learned.trainer or spell in learned.quest or spell in learned.book or is_talent or acquire == ACQUIRE_ON_LEARN
    else:
        taught = is_talent or spell in facts.levels
    if not taught:
        gaps.untaught.append(spell)
    return taught


def class_spells(
    abilities: Iterable[Row],
    line_class: Mapping[int, str],
    facts: SpellFacts,
    classic_ids: frozenset[int],
    learned: Learned,
    gaps: SpellGaps,
) -> list[Spell]:
    """Every class's trainable spells, one per class + name, ranks in order."""
    seen: set[tuple[str, int]] = set()
    tabs: dict[tuple[str, str], int] = {}
    ranks: dict[tuple[str, str], list[Rank]] = defaultdict(list)
    races: dict[tuple[str, str], set[int]] = defaultdict(set)
    for row in abilities:
        class_id = line_class.get(_int(row["SkillLine"]))
        spell = _int(row["Spell"])
        if class_id is None or (class_id, spell) in seen:
            continue
        seen.add((class_id, spell))
        if not _keep(spell, _int(row.get("AcquireMethod")), facts, classic_ids, learned, gaps):
            continue
        key = (class_id, facts.names[spell].strip())
        tabs.setdefault(key, _int(row["SkillLine"]))
        races[key] |= races_of(_int(row.get("RaceMasks_0")))
        ranks[key].append(Rank(
            spell=spell,
            rank=facts.subtexts.get(spell, "").strip(),
            level=facts.levels.get(spell),
            passive=bool(facts.attributes.get(spell, 0) & ATTR0_PASSIVE),
            from_talent=spell in learned.talent_of,
        ))
    out = []
    for (class_id, name), group in ranks.items():
        ordered = tuple(sorted(group, key=lambda r: (rank_number(r.rank), r.level or 0, r.spell)))
        talent = next((t for r in ordered if r.from_talent and (t := learned.talent_of[r.spell]) is not None), None)
        icon = next((facts.icons[r.spell] for r in reversed(ordered) if r.spell in facts.icons), 0)
        allowed = frozenset(races[(class_id, name)])
        out.append(Spell(class_id, name, tabs[(class_id, name)], ordered, allowed, talent, icon))
    return sorted(out, key=lambda s: (s.class_id, s.tab, _first_level(s), s.name))


def _first_level(spell: Spell) -> tuple[bool, int]:
    """Lowest learn level first; a spell with no level (most talents) after the rest of its tab."""
    levels = [r.level for r in spell.ranks if r.level]
    return (not levels, min(levels, default=0))


def talent_spells(client_talents: Iterable[Row], live: Mapping[int, int]) -> dict[int, int | None]:
    """Talent rank spell -> the live talent it belongs to, None when the live trees dropped it.

    ``client_talents`` are the Forever client's ``Talent`` rows (the old trees,
    but every rank's spell); ``live`` is each live talent's rank-1 spell -> its
    id (``data/talents/<class>.json``), which a client row shares when the
    talent survived.
    """
    out: dict[int, int | None] = {}
    for row in client_talents:
        spells = rank_spells(row)
        talent = next((live[s] for s in spells if s in live), None)
        out.update(dict.fromkeys(spells, talent))
    out.update(live)
    return out
