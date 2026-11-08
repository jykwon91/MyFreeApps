"""Each playable race's racial traits in one client, and how Forever's compare with Classic's (pure).

A racial is a spell a race's own racial skill line teaches (``SkillLine``
category 9 with the racial flag — "Dwarven Racial", "Skyborne Racial" ...): ``SkillLineAbility``
on that line, owned by the races ``SkillRaceClassInfo`` gives the line, and
narrowed by the ability row's own race and class masks when it has them (the
Skyborne line hands a different active to each faction; Gnome's "Eureka!"
is one spell per class). Spells with no tooltip are the game's hidden
helpers ("Quickness Passive") and are left out.

Spells with one name on one race are one racial; its class versions are its
variants, and versions that read the same are merged. A Forever racial is
paired with Classic's by a shared spell id first — so a trait Forever renamed
(Human "Sword Specialization" is now "Ruthless", same spell) is "changed",
not one removed and one new — then by name. Statuses:

* ``new`` — no Classic twin;
* ``removed`` — a Classic racial with no Forever twin;
* ``changed`` — the name, or any version's text, reads differently;
* ``unchanged`` — same name and every version reads the same.

A token a book can't fill reads "?" (a short racial tooltip is often one
sentence, so dropping it as the talent calculator does would leave nothing)
and the racial is compared with the "?" in place, so a value is never guessed
(``Racial.full`` says whether any "?" is in it; the page says what "?" means).
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from scripts.wow_changes.describe import clean_text
from scripts.wow_food.tooltip import SpellBook, evaluate, unresolved_tokens
from scripts.wow_macros.build import CLASS_MASKS

Row = Mapping[str, str]

# Racial lines share SkillLine category 9 ("secondary") with Cooking, Riding and the like;
# the 0x2 flag is set on every racial line and on none of those (checked on 1.60.1 and 1.15.9).
SECONDARY_SKILL_CATEGORY = 9
RACIAL_SKILL_FLAG = 0x2
# SpellMisc.Attributes_0: the spell is a passive trait, not a button.
ATTR0_PASSIVE = 0x40
# A class mask of 0 or -1 on an ability row means every class.
ALL_CLASSES_MASKS = (0, -1)
_LOW_32 = 0xFFFFFFFF
# Stands in for a tooltip value the game files don't hold (War Stomp's target count).
UNKNOWN_VALUE = "?"

STATUS_NEW = "new"
STATUS_CHANGED = "changed"
STATUS_UNCHANGED = "unchanged"
STATUS_REMOVED = "removed"
KIND_ACTIVE = "active"
KIND_PASSIVE = "passive"

_NON_SLUG = re.compile(r"[^a-z0-9]+")


def slug(name: str) -> str:
    """"Artisan's Precision" -> "artisans-precision", "Night Elf" -> "night-elf"."""
    return _NON_SLUG.sub("-", name.lower().replace("'", "")).strip("-")


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def race_mask(row: Row) -> int:
    """A row's 64-bit race mask (``RaceMasks_0`` low, ``RaceMasks_1`` high; older rows: ``RaceMask``)."""
    mask = (_int(row.get("RaceMasks_0")) & _LOW_32) | ((_int(row.get("RaceMasks_1")) & _LOW_32) << 32)
    return mask or (_int(row.get("RaceMask")) & _LOW_32)


def class_slugs(mask: int) -> frozenset[str] | None:
    """The classes a class mask names; None when it means every class."""
    if mask in ALL_CLASSES_MASKS:
        return None
    return frozenset(c for c, bit in CLASS_MASKS.items() if mask & bit)


def racial_lines(skill_lines: Iterable[Row]) -> set[int]:
    return {
        _int(r["ID"])
        for r in skill_lines
        if _int(r["CategoryID"]) == SECONDARY_SKILL_CATEGORY and _int(r["Flags"]) & RACIAL_SKILL_FLAG
    }


def line_races(skill_race_class: Iterable[Row], lines: set[int], race_bits: Mapping[int, int]) -> dict[int, set[int]]:
    """Racial line -> the playable races (``race_bits``: race id -> its mask bit) that own it."""
    out: dict[int, set[int]] = {}
    for row in skill_race_class:
        line = _int(row["SkillID"])
        if line not in lines:
            continue
        mask = race_mask(row)
        out.setdefault(line, set()).update(race for race, bit in race_bits.items() if mask & bit)
    return out


@dataclass(frozen=True)
class RacialSpell:
    race: int
    spell: int
    name: str
    classes: frozenset[str] | None


def racial_spells(
    abilities: Iterable[Row],
    owners: Mapping[int, set[int]],
    race_bits: Mapping[int, int],
    names: Mapping[int, str],
    descriptions: Mapping[int, str],
) -> list[RacialSpell]:
    """Every (race, spell) the racial lines teach, in the ability table's order; tooltip-less helpers left out."""
    out: list[RacialSpell] = []
    seen: set[tuple[int, int]] = set()
    for row in abilities:
        races = owners.get(_int(row["SkillLine"]))
        spell = _int(row["Spell"])
        name = (names.get(spell) or "").strip()
        if not races or not name or not (descriptions.get(spell) or "").strip():
            continue
        own = race_mask(row)
        for race in sorted(races):
            if own and not own & race_bits[race]:
                continue
            if (race, spell) in seen:
                continue
            seen.add((race, spell))
            out.append(RacialSpell(race, spell, name, class_slugs(_int(row["ClassMask"]))))
    return out


def spell_text(book: SpellBook, spell: int) -> tuple[str, bool]:
    """A tooltip as shown (each value the files don't hold as ``UNKNOWN_VALUE``) and whether it read in full."""
    text = evaluate(book, spell, conditional_else=True)
    tokens = unresolved_tokens(text)
    for token in sorted(set(tokens), key=len, reverse=True):
        text = text.replace(token, UNKNOWN_VALUE)
    return clean_text(text), not tokens


@dataclass(frozen=True)
class Variant:
    """One version of a racial: the classes it's for (None = all the race's classes) and its text."""

    classes: tuple[str, ...] | None
    text: str
    spells: tuple[int, ...]
    full: bool


@dataclass
class Racial:
    name: str
    kind: str
    icon: int
    variants: list[Variant] = field(default_factory=list)

    @property
    def spells(self) -> set[int]:
        return {s for v in self.variants for s in v.spells}

    @property
    def full(self) -> bool:
        return all(v.full for v in self.variants)


def _normalised(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def group_racials(
    spells: Iterable[RacialSpell],
    race_classes: frozenset[str],
    book: SpellBook,
    passive: Mapping[int, bool],
    icons: Mapping[int, int],
) -> list[Racial]:
    """One race's spells as racials: grouped by name, each version narrowed to the race's classes, same texts merged."""
    by_name: dict[str, list[RacialSpell]] = {}
    for s in spells:
        by_name.setdefault(s.name, []).append(s)
    out: list[Racial] = []
    for name, versions in by_name.items():
        merged: dict[str, tuple[set[str] | None, list[int], bool, str]] = {}
        for s in versions:
            classes = None if s.classes is None else set(s.classes & race_classes)
            if classes is not None and not classes:
                continue
            text, full = spell_text(book, s.spell)
            key = _normalised(text)
            if key in merged:
                had, ids, had_full, shown = merged[key]
                union = None if had is None or classes is None else had | classes
                merged[key] = (union, [*ids, s.spell], had_full and full, shown)
            else:
                merged[key] = (classes, [s.spell], full, text)
        if not merged:
            continue
        variants = [
            Variant(
                classes=None if classes is None or classes >= race_classes else tuple(sorted(classes)),
                text=text,
                spells=tuple(ids),
                full=full,
            )
            for classes, ids, full, text in merged.values()
        ]
        variants.sort(key=lambda v: (v.classes is not None, v.classes or ()))
        first = versions[0].spell
        out.append(Racial(
            name=name,
            kind=KIND_PASSIVE if passive.get(first) else KIND_ACTIVE,
            icon=next((icons[s.spell] for s in versions if icons.get(s.spell)), 0),
            variants=variants,
        ))
    return out


def pair_racials(forever: list[Racial], classic: list[Racial]) -> list[tuple[Racial | None, Racial | None]]:
    """Forever's racials, each with its Classic twin (by shared spell id, then name) or None; then Classic's left over."""
    left = list(classic)
    pairs: list[tuple[Racial | None, Racial | None]] = []
    for f in forever:
        twin = next((c for c in left if c.spells & f.spells), None) or next((c for c in left if c.name == f.name), None)
        if twin is not None:
            left.remove(twin)
        pairs.append((f, twin))
    pairs.extend((None, c) for c in left)
    return pairs


def _reading(racial: Racial) -> list[tuple[tuple[str, ...] | None, str]]:
    return sorted(((v.classes, _normalised(v.text)) for v in racial.variants), key=lambda r: (r[0] or (), r[1]))


def racial_status(forever: Racial | None, classic: Racial | None) -> str:
    if classic is None:
        return STATUS_NEW
    if forever is None:
        return STATUS_REMOVED
    if forever.name != classic.name or _reading(forever) != _reading(classic):
        return STATUS_CHANGED
    return STATUS_UNCHANGED


def passive_spells(spell_misc: Iterable[Row]) -> dict[int, bool]:
    """Spell id -> whether it's a passive trait (``SpellMisc.Attributes_0``, base difficulty)."""
    out: dict[int, bool] = {}
    for r in spell_misc:
        if _int(r.get("DifficultyID")) == 0:
            out.setdefault(_int(r["SpellID"]), bool(_int(r["Attributes_0"]) & ATTR0_PASSIVE))
    return out

