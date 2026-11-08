"""Class spells whose tooltip reads differently in Forever, and class spells new in Forever (pure).

Scope: the spells a class's own skill lines teach (``SkillLineAbility`` on
the class lines the Macros build checks, ``wow_macros.build.CLASS_LINES``) —
the trainer spells players learn, not every spell in the client. Talent rank
spells are left out (the talent rows cover them).

Each side's tooltip is evaluated the way the talent build reads ranks: the
Forever spell book with every hotfix layer, and Classic's — the Classic Era
client's wording with cmangos' 1.12 numbers, because the Era client zeroes
most base points (``wow_talents.books``). A rank is compared only when both
texts read in full; one with a token neither book can fill is counted as a
gap, never guessed.

A Forever spell is paired with Classic's by id, else by class + name + rank
("Rank 2"), so a rank Forever re-numbered is still compared. A name the class
never had in Classic is a new spell.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from scripts.wow_changes.describe import clean_text, describe_ranks, describe_text
from scripts.wow_changes.entry import KIND_CHANGED, KIND_NEW, Change
from scripts.wow_food.tooltip import SpellBook, evaluate, unresolved_tokens
from scripts.wow_macros.build import PLACEHOLDER

Row = Mapping[str, str]

_RANK = re.compile(r"\d+")


@dataclass
class SpellGaps:
    """What the books couldn't compare, for the run's report and the page's footnote."""

    incomplete: int = 0
    not_in_client: int = 0
    unresolved: dict[int, list[str]] = field(default_factory=dict)


@dataclass(frozen=True)
class ClassSpell:
    class_id: str
    spell: int
    name: str
    rank: str


def full_text(book: SpellBook, spell: int) -> str | None:
    """A spell's tooltip as the game shows it; None when it's missing or a token can't be filled."""
    if not book.descriptions.get(spell):
        return None
    text = evaluate(book, spell, conditional_else=True)
    return None if unresolved_tokens(text) else clean_text(text)


def class_spells(
    abilities: Iterable[Row],
    line_class: Mapping[int, str],
    names: Mapping[int, str],
    ranks: Mapping[int, str],
    skip: set[int],
) -> list[ClassSpell]:
    """The spells each class's skill lines teach, talent ranks and placeholders left out."""
    seen: set[tuple[str, int]] = set()
    out = []
    for row in abilities:
        class_id = line_class.get(int(row["SkillLine"]))
        spell = int(row["Spell"])
        name = (names.get(spell) or "").strip()
        if class_id is None or spell in skip or not name or PLACEHOLDER.search(name) or (class_id, spell) in seen:
            continue
        seen.add((class_id, spell))
        out.append(ClassSpell(class_id, spell, name, (ranks.get(spell) or "").strip()))
    return out


def _rank_order(rank: str) -> tuple[int, str]:
    found = _RANK.search(rank)
    return (int(found.group()) if found else 0, rank)


def _label(rank: str) -> str:
    return rank or "Spell"


def spell_changes(
    forever: list[ClassSpell],
    classic: list[ClassSpell],
    forever_book: SpellBook,
    classic_book: SpellBook,
    gaps: SpellGaps,
) -> list[Change]:
    """One row per class + spell name: the ranks that read differently, or the new spell's first rank."""
    classic_ids = {s.spell for s in classic}
    classic_by_rank = {(s.class_id, s.name, s.rank): s.spell for s in classic}
    classic_names = {(s.class_id, s.name) for s in classic}
    changed: dict[tuple[str, str], list[tuple[str, str, str]]] = defaultdict(list)
    ranks_of: dict[tuple[str, str], set[str]] = defaultdict(set)
    new: dict[tuple[str, str], list[tuple[str, str | None]]] = defaultdict(list)
    for s in sorted(forever, key=lambda s: (s.class_id, s.name, _rank_order(s.rank))):
        group = (s.class_id, s.name)
        ranks_of[group].add(s.rank)
        if s.spell not in forever_book.descriptions:
            gaps.not_in_client += 1
            continue
        now = full_text(forever_book, s.spell)
        if group not in classic_names:
            new[group].append((s.rank, now))
            continue
        twin = s.spell if s.spell in classic_ids else classic_by_rank.get((s.class_id, s.name, s.rank))
        was = full_text(classic_book, twin) if twin is not None else None
        if now is None or was is None:
            gaps.incomplete += 1
            if now is None:
                gaps.unresolved[s.spell] = unresolved_tokens(evaluate(forever_book, s.spell, conditional_else=True))
            continue
        if was.lower() != now.lower():
            changed[group].append((_label(s.rank), was, now))
    out = [
        Change(
            key=f"spell:{class_id}:{name}",
            kind=KIND_CHANGED,
            name=name,
            summary=describe_ranks([(label, describe_text(a, b)) for label, a, b in rows], len(ranks_of[(class_id, name)])),
            rows=tuple(rows),
            classes=(class_id,),
        )
        for (class_id, name), rows in changed.items()
    ]
    for (class_id, name), ranks in new.items():
        first = next(((r, t) for r, t in ranks if t), None)
        count = len(ranks)
        out.append(Change(
            key=f"spell:{class_id}:{name}",
            kind=KIND_NEW,
            name=name,
            summary=f"New spell with {count} ranks." if count > 1 else "New spell.",
            rows=((_label(first[0]), None, first[1]),) if first else (),
            classes=(class_id,),
        ))
    return sorted(out, key=lambda c: (c.classes, c.name))
