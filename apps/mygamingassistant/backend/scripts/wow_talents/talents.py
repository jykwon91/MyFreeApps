"""Talent trees from the client's ``Talent`` and ``TalentTab`` rows (pure).

A tree is a ``TalentTab`` (its ``ClassMask`` names the class, ``OrderIndex``
its place left to right). A talent sits at ``TierID`` (row, 0-6) and
``ColumnIndex`` (0-3); its ranks are the non-zero ``SpellRank_N`` spells and
its prerequisites ``PrereqTalent_N`` at ``PrereqRank_N`` — 0-based, so 0 means
"rank 1".

A rank's text is its spell's tooltip, evaluated. The Forever server sends
most rank spells only when a client asks for them, so many aren't in any
file yet: those ranks are ``None``, never worked out from their neighbours
(Forever's ranks don't step evenly — Natural Grace goes -30, -10, -15).
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from scripts.wow_food.tooltip import SpellBook, evaluate, unresolved_tokens

Row = Mapping[str, str]

MAX_RANKS = 9
MAX_PREREQS = 3
TIERS = 7
COLUMNS = 4
_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")
# Talent tab ClassMask bit -> the frontend's class id (``data/classes.ts``).
CLASS_MASKS: dict[int, str] = {
    1: "warrior",
    2: "paladin",
    4: "hunter",
    8: "rogue",
    16: "priest",
    64: "shaman",
    128: "mage",
    256: "warlock",
    1024: "druid",
}


@dataclass(frozen=True)
class Talent:
    id: int
    name: str
    tier: int
    column: int
    icon: int
    rank_spells: tuple[int, ...]
    ranks: tuple[str | None, ...]
    prereqs: tuple[tuple[int, int], ...]
    # True when no rank is in the Forever client yet, so the name is the Classic Era client's.
    classic_name: bool = False


@dataclass(frozen=True)
class Fallback:
    """The Classic Era client's names and icons, for talents with no rank in the Forever client.

    ``icons`` should only hold icon files the Forever client uses too, so the
    icon publish (which reads the Forever client) finds them.
    """

    names: Mapping[int, str] = field(default_factory=dict)
    icons: Mapping[int, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Tree:
    id: int
    name: str
    icon: int
    talents: tuple[Talent, ...]


@dataclass
class Gaps:
    """What the client data couldn't fill, for the run's report."""

    missing_ranks: int = 0
    nameless: list[int] = field(default_factory=list)
    unresolved: dict[int, list[str]] = field(default_factory=dict)


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def rank_spells(row: Row) -> tuple[int, ...]:
    """A talent's rank spells, rank 1 first."""
    spells = [_int(row.get(f"SpellRank_{i}")) for i in range(MAX_RANKS)]
    return tuple(s for s in spells if s)


def prerequisites(row: Row) -> tuple[tuple[int, int], ...]:
    """``(talent id, rank needed)`` pairs, the rank 1-based."""
    pairs = []
    for i in range(MAX_PREREQS):
        talent = _int(row.get(f"PrereqTalent_{i}"))
        if talent:
            pairs.append((talent, _int(row.get(f"PrereqRank_{i}")) + 1))
    return tuple(pairs)


def tidy(text: str) -> str:
    """A rank text as shown: a sentence with a token the evaluator couldn't fill is left out.

    The few left (``$SPFR``, ``$proccooldown``) read values the client files
    don't carry. Half a sentence ("can only happen once every sec.") would be
    wrong, so the whole sentence goes; the run reports which ranks lost one.
    """
    sentences = _SENTENCE_BREAK.split(re.sub(r"\s+", " ", text).strip())
    return " ".join(s for s in sentences if not unresolved_tokens(s))


def rank_text(book: SpellBook, spell: int, gaps: Gaps | None = None) -> str | None:
    """A rank spell's tooltip, or None when the spell isn't in the book."""
    if spell not in book.descriptions:
        return None
    text = evaluate(book, spell, conditional_else=True)
    left = unresolved_tokens(text)
    if left and gaps is not None:
        gaps.unresolved[spell] = left
    return tidy(text)


def build_trees(
    tabs: Iterable[Row],
    talents: Iterable[Row],
    book: SpellBook,
    icons: Mapping[int, int],
    gaps: Gaps,
    fallback: Fallback | None = None,
) -> dict[str, list[Tree]]:
    """Class id -> its three trees, left to right, each talent in tier then column order."""
    by_tab: dict[int, list[Row]] = {}
    for row in talents:
        by_tab.setdefault(_int(row["TabID"]), []).append(row)
    classes: dict[str, list[tuple[int, Tree]]] = {}
    for tab in tabs:
        class_id = CLASS_MASKS.get(_int(tab["ClassMask"]))
        if class_id is None:
            continue
        rows = sorted(by_tab.get(_int(tab["ID"]), []), key=lambda r: (_int(r["TierID"]), _int(r["ColumnIndex"])))
        tree = Tree(
            id=_int(tab["ID"]),
            name=tab["Name_lang"],
            icon=_int(tab["SpellIconID"]),
            talents=tuple(_talent(row, book, icons, gaps, fallback or Fallback()) for row in rows),
        )
        classes.setdefault(class_id, []).append((_int(tab["OrderIndex"]), tree))
    return {cid: [t for _, t in sorted(trees, key=lambda p: p[0])] for cid, trees in sorted(classes.items())}


def _first_name(spells: Iterable[int], names: Mapping[int, str]) -> str:
    return next((names[s] for s in spells if names.get(s)), "")


def _first_icon(spells: Iterable[int], icons: Mapping[int, int]) -> int:
    return next((icons[s] for s in spells if icons.get(s)), 0)


def _talent(row: Row, book: SpellBook, icons: Mapping[int, int], gaps: Gaps, fallback: Fallback) -> Talent:
    spells = rank_spells(row)
    ranks = tuple(rank_text(book, s, gaps) for s in spells)
    gaps.missing_ranks += sum(1 for r in ranks if r is None)
    # A talent's name and icon are its rank-1 spell's; when the server hasn't sent
    # that one, any rank it has sent carries the same.
    name = _first_name(spells, book.names)
    icon = _first_icon(spells, icons)
    talent_id = _int(row["ID"])
    classic_name = not name
    if classic_name:
        gaps.nameless.append(talent_id)
        name = _first_name(spells, fallback.names)
        icon = icon or _first_icon(spells, fallback.icons)
    return Talent(
        id=talent_id,
        name=name,
        tier=_int(row["TierID"]),
        column=_int(row["ColumnIndex"]),
        icon=icon,
        rank_spells=spells,
        ranks=ranks,
        prereqs=prerequisites(row),
        classic_name=classic_name,
    )


def _normalised(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def classic_changes(trees: Iterable[Tree], classic: SpellBook, gaps: Gaps) -> dict[int, list[str | None]]:
    """Talent id -> Classic's text per rank, for the talents whose Forever text differs.

    A rank counts as changed only when both sides read in full (no token
    left) and their texts still differ; a rank with no Forever text yet
    can't be compared and isn't marked.
    """
    changes: dict[int, list[str | None]] = {}
    for tree in trees:
        for talent in tree.talents:
            texts: list[str | None] = []
            changed = False
            for spell, forever in zip(talent.rank_spells, talent.ranks):
                was = _classic_text(classic, spell)
                full = forever is not None and spell not in gaps.unresolved
                if full and was is not None and _normalised(forever or "") != _normalised(was):
                    texts.append(was)
                    changed = True
                else:
                    texts.append(None)
            if changed:
                changes[talent.id] = texts
    return changes


def _classic_text(book: SpellBook, spell: int) -> str | None:
    if not book.descriptions.get(spell):
        return None
    text = evaluate(book, spell, conditional_else=True)
    return None if unresolved_tokens(text) else re.sub(r"\s+", " ", text).strip()


def tree_doc(tree: Tree) -> dict[str, object]:
    return {
        "id": tree.id,
        "name": tree.name,
        "icon": tree.icon,
        "talents": [
            {
                "id": t.id,
                "name": t.name,
                "tier": t.tier,
                "column": t.column,
                "icon": t.icon,
                "ranks": list(t.ranks),
                "prereqs": [list(p) for p in t.prereqs],
                **({"classicName": True} if t.classic_name else {}),
            }
            for t in tree.talents
        ],
    }
