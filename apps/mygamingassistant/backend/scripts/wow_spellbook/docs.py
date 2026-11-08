"""The Spellbook's JSON documents from the class spells (pure).

``spell_doc`` is one spell as the page reads it (``types/spellbook/spellbookSpell.ts``);
``ClassicFill`` collects, per class, what only Classic data can give: trainer
costs, quest- and book-taught spells, and the text / level of ranks the Forever client
can't give in full. Empty fields are left out so the files stay small.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from scripts.wow_spellbook.spells import ALL_RACES, Spell

CHANGED = "changed"
NEW = "new"
# The Changes feed labels a rank "Rank N", or the spell's subtext, or "Spell" (``wow_changes.spells._label``).
UNRANKED_LABEL = "Spell"


@dataclass(frozen=True)
class ChangeInfo:
    """A spell's row in the Changes vs Classic feed."""

    kind: str
    rank_labels: frozenset[str] = frozenset()


def change_info(entries: list[Mapping[str, Any]]) -> dict[str, ChangeInfo]:
    """``spell:<class>:<name>`` -> how the feed lists it."""
    return {
        e["key"]: ChangeInfo(e["kind"], frozenset(r[0] for r in e.get("rows", []) if e["kind"] == CHANGED))
        for e in entries
    }


@dataclass
class ClassicFill:
    costs: dict[int, int] = field(default_factory=dict)
    quests: set[int] = field(default_factory=set)
    books: set[int] = field(default_factory=set)
    texts: dict[int, str] = field(default_factory=dict)
    levels: dict[int, int] = field(default_factory=dict)

    def doc(self, source: str, class_id: str) -> dict[str, Any]:
        return {
            "source": source,
            "classId": class_id,
            "costs": {str(k): v for k, v in sorted(self.costs.items())},
            "quests": sorted(self.quests),
            "books": sorted(self.books),
            "texts": {str(k): v for k, v in sorted(self.texts.items())},
            "levels": {str(k): v for k, v in sorted(self.levels.items())},
        }


@dataclass
class FieldCounts:
    """How many ranks had each field from Forever, from Classic, or not at all — the run's report."""

    ranks: int = 0
    text_classic: int = 0
    text_blank: int = 0
    level_classic: int = 0
    level_blank: int = 0
    level_talent: int = 0
    cost_known: int = 0
    quest: int = 0
    book: int = 0


def spell_doc(
    spell: Spell,
    forever_text: Callable[[int], str | None],
    classic_text: Callable[[int], str | None],
    classic_level: Mapping[int, int],
    costs: Mapping[int, int],
    quests: set[int],
    books: set[int],
    changes: Mapping[str, ChangeInfo],
    downrank: Mapping[tuple[str, str], str],
    fill: ClassicFill,
    counts: FieldCounts,
) -> dict[str, Any]:
    """One spell; its Classic-only facts go into ``fill``."""
    change = changes.get(f"spell:{spell.class_id}:{spell.name}")
    ranks = []
    for r in spell.ranks:
        counts.ranks += 1
        doc: dict[str, Any] = {"spell": r.spell}
        if r.rank:
            doc["rank"] = r.rank
        if r.from_talent:
            # A talent's spell level isn't when you can take it (often 1) — the tree decides that.
            counts.level_talent += 1
        elif r.level:
            doc["level"] = r.level
        elif r.spell in classic_level:
            fill.levels[r.spell] = classic_level[r.spell]
            counts.level_classic += 1
        else:
            counts.level_blank += 1
        text = forever_text(r.spell)
        if text:
            doc["text"] = text
        elif (old := classic_text(r.spell)) is not None:
            fill.texts[r.spell] = old
            counts.text_classic += 1
        else:
            counts.text_blank += 1
        if r.from_talent:
            doc["talent"] = True
        elif r.spell in costs:
            fill.costs[r.spell] = costs[r.spell]
            counts.cost_known += 1
        elif r.spell in quests:
            fill.quests.add(r.spell)
            counts.quest += 1
        elif r.spell in books:
            fill.books.add(r.spell)
            counts.book += 1
        if r.passive:
            doc["passive"] = True
        if change is not None and (r.rank or UNRANKED_LABEL) in change.rank_labels:
            doc["changed"] = True
        ranks.append(doc)
    out: dict[str, Any] = {"id": spell.ranks[0].spell, "name": spell.name, "tab": spell.tab, "icon": spell.icon}
    if spell.races != ALL_RACES:
        out["races"] = sorted(spell.races)
    if spell.talent is not None:
        out["talent"] = spell.talent
    if family := downrank.get((spell.class_id, spell.name)):
        out["downrank"] = family
    if change is not None:
        out["changed"] = change.kind
    out["ranks"] = ranks
    return out


LINE_BREAK = ",\n"


def _compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write_lines(path: Path, doc: Mapping[str, Any], list_key: str) -> None:
    """The JSON with one ``list_key`` entry per line, so a refresh diff names the spells that moved."""
    head = [f"{json.dumps(k)}:{_compact(v)}" for k, v in doc.items() if k != list_key]
    rows = LINE_BREAK.join(_compact(row) for row in doc[list_key])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{" + LINE_BREAK.join([*head, f'"{list_key}":[\n{rows}\n]']) + "}\n", encoding="utf-8")
