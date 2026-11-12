"""Talent trees from Blizzard's Game Data API, and their Classic comparison (pure).

The live server's trees are Blizzard's ``/data/wow/talent-tree/{tree}/
playable-specialization/{spec}`` answers (``static-forever-us``): one per
spec, each talent a node with ``display_row`` (1-7) and ``display_col``. A
class's three trees share one column scale — the first tree's talents sit in
columns 1-4, the second's in 7-10, the third's in 14-17 — so the band a tree's
talents sit in is its place left to right, and ``display_col`` minus the
band's first column is the talent's column in its tree. A node outside the
7 x 4 grid (a stray copy Blizzard keeps at row 63 or column 170) isn't in the
game's tree and is left out; the run reports it.

A node's ranks carry the talent (id, name) and the rank-1 spell (every rank
names the same spell) with that rank's tooltip, numbers filled in by
Blizzard. ``locked_by`` lists the nodes it needs — at their max rank, the
Classic rule. A "requirement" on a lower row (Intimidation lists Bestial
Wrath, the talent it unlocks) is the link read backwards and is dropped.

The Classic comparison pairs a talent with the Classic Era talent whose rank-1
spell it shares, else the one of its class with its name; a talent with
neither is new in Forever.
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from scripts.wow_food.tooltip import SpellBook, evaluate, unresolved_tokens

Row = Mapping[str, str]
Payload = Mapping[str, Any]

MAX_RANKS = 9
TIERS = 7
COLUMNS = 4
# The first ``display_col`` of each of a class's trees, left to right.
TREE_COLUMN_BASES = (1, 7, 14)
_LINE_END = re.compile(r"[.!?:]$")
# Talent tab ClassMask bit -> the frontend's class id (``data/classes.ts``), for the Classic Era client.
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
# Blizzard's playable class id -> the frontend's class id.
CLASS_IDS: dict[int, str] = {
    1: "warrior",
    2: "paladin",
    3: "hunter",
    4: "rogue",
    5: "priest",
    7: "shaman",
    8: "mage",
    9: "warlock",
    11: "druid",
}


@dataclass(frozen=True)
class Talent:
    id: int
    name: str
    tier: int
    column: int
    icon: int
    # The rank-1 spell: Blizzard names it on every rank.
    spell: int
    ranks: tuple[str, ...]
    # ``(talent id, rank needed)``, the rank 1-based.
    prereqs: tuple[tuple[int, int], ...]


@dataclass(frozen=True)
class Tree:
    # Blizzard's playable specialization id.
    id: int
    name: str
    icon: int
    talents: tuple[Talent, ...]


@dataclass(frozen=True)
class ClassicTalent:
    """A Classic Era client talent: its name (the rank-1 spell's) and rank spells."""

    name: str
    rank_spells: tuple[int, ...]


@dataclass
class Comparison:
    """A class's talents against Classic: Classic's text per changed rank, and the talents Classic has no match for."""

    changes: dict[int, list[str | None]] = field(default_factory=dict)
    new: set[int] = field(default_factory=set)


@dataclass
class Gaps:
    """What the API data didn't fit, for the run's report."""

    off_grid: list[str] = field(default_factory=list)
    backward_prereqs: list[str] = field(default_factory=list)
    lost_prereqs: list[str] = field(default_factory=list)
    no_icon: list[str] = field(default_factory=list)


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


def rank_spells(row: Row) -> tuple[int, ...]:
    """A client ``Talent`` row's rank spells, rank 1 first."""
    spells = [_int(row.get(f"SpellRank_{i}")) for i in range(MAX_RANKS)]
    return tuple(s for s in spells if s)


def rank_text(description: str) -> str:
    """Blizzard's tooltip as one paragraph: its lines joined, a line without an ending getting a full stop.

    ``"Requires Bear Form\\r\\nCharge an enemy."`` → ``"Requires Bear Form. Charge an enemy."``
    """
    lines = [re.sub(r"\s+", " ", line).strip() for line in description.splitlines()]
    lines = [line for line in lines if line]
    return " ".join(line if _LINE_END.search(line) or i == len(lines) - 1 else f"{line}." for i, line in enumerate(lines))


def _node_talent(node: Payload) -> Payload:
    return node["ranks"][0]["tooltip"]["talent"]


def node_spell(node: Payload) -> int:
    return int(node["ranks"][0]["tooltip"]["spell_tooltip"]["spell"]["id"])


def tree_spells(payloads: Iterable[Payload]) -> set[int]:
    """Every talent's rank-1 spell across the spec trees, for the icon lookup."""
    return {node_spell(n) for p in payloads for n in p["spec_talent_nodes"]}


def tree_band(nodes: Sequence[Payload]) -> int:
    """The tree's place in its class (0-2): the column band most of its talents sit in."""
    counts = [
        sum(1 for n in nodes if base <= int(n["display_col"]) < base + COLUMNS) for base in TREE_COLUMN_BASES
    ]
    return counts.index(max(counts))


def _on_grid(node: Payload, base: int) -> bool:
    return 1 <= int(node["display_row"]) <= TIERS and base <= int(node["display_col"]) < base + COLUMNS


def spec_tree(payload: Payload, icons: Mapping[int, int], tree_icon: int, gaps: Gaps) -> tuple[str, int, Tree] | None:
    """``(class id, place left to right, tree)`` for one spec answer; None for a class the site doesn't list."""
    class_id = CLASS_IDS.get(int(payload["playable_class"]["id"]))
    if class_id is None:
        return None
    name = payload["name"]
    nodes = payload["spec_talent_nodes"]
    band = tree_band(nodes)
    base = TREE_COLUMN_BASES[band]
    kept = []
    for node in nodes:
        if _on_grid(node, base):
            kept.append(node)
        else:
            gaps.off_grid.append(
                f"{class_id} {name}: {_node_talent(node)['name']} at row {node['display_row']}, column {node['display_col']}"
            )
    kept.sort(key=lambda n: (int(n["display_row"]), int(n["display_col"])))
    by_node = {int(n["id"]): n for n in kept}
    talents = []
    for node in kept:
        talent = _node_talent(node)
        spell = node_spell(node)
        prereqs = []
        for required in node.get("locked_by") or []:
            before = by_node.get(int(required))
            if before is None:
                gaps.lost_prereqs.append(f"{class_id} {name}: {talent['name']} needs node {required}, not on the grid")
                continue
            if int(before["display_row"]) > int(node["display_row"]):
                gaps.backward_prereqs.append(f"{class_id} {name}: {talent['name']} -> {_node_talent(before)['name']}")
                continue
            prereqs.append((int(_node_talent(before)["id"]), len(before["ranks"])))
        icon = icons.get(spell, 0)
        if not icon:
            gaps.no_icon.append(f"{class_id} {name}: {talent['name']} (spell {spell})")
        talents.append(Talent(
            id=int(talent["id"]),
            name=talent["name"],
            tier=int(node["display_row"]) - 1,
            column=int(node["display_col"]) - base,
            icon=icon,
            spell=spell,
            ranks=tuple(rank_text(r["tooltip"]["spell_tooltip"]["description"]) for r in node["ranks"]),
            prereqs=tuple(prereqs),
        ))
    tree = Tree(id=int(payload["playable_specialization"]["id"]), name=name, icon=tree_icon, talents=tuple(talents))
    return class_id, band, tree


def build_trees(
    payloads: Iterable[Payload],
    icons: Mapping[int, int],
    tree_icons: Mapping[int, int],
    gaps: Gaps,
) -> dict[str, list[Tree]]:
    """Class id -> its trees, left to right, each talent in tier then column order."""
    classes: dict[str, list[tuple[int, Tree]]] = {}
    for payload in payloads:
        spec = int(payload["playable_specialization"]["id"])
        parsed = spec_tree(payload, icons, tree_icons.get(spec, 0), gaps)
        if parsed is None:
            continue
        class_id, band, tree = parsed
        classes.setdefault(class_id, []).append((band, tree))
    for class_id, trees in classes.items():
        bands = [band for band, _ in trees]
        if len(bands) != len(set(bands)):
            names = ", ".join(f"{t.name} (band {b})" for b, t in trees)
            raise ValueError(f"{class_id}: two trees sit in the same column band, so their order is unknown: {names}")
    return {cid: [t for _, t in sorted(trees, key=lambda p: p[0])] for cid, trees in sorted(classes.items())}


def classic_talents(tabs: Iterable[Row], talents: Iterable[Row], names: Mapping[int, str]) -> dict[str, list[ClassicTalent]]:
    """Class id -> the Classic Era client's talents, from its ``TalentTab`` / ``Talent`` rows."""
    tab_class = {_int(t["ID"]): CLASS_MASKS.get(_int(t["ClassMask"])) for t in tabs}
    out: dict[str, list[ClassicTalent]] = {}
    for row in talents:
        class_id = tab_class.get(_int(row["TabID"]))
        spells = rank_spells(row)
        if class_id is None or not spells:
            continue
        out.setdefault(class_id, []).append(ClassicTalent(names.get(spells[0], ""), spells))
    return out


def _normalised(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def match_classic(talent: Talent, candidates: Iterable[ClassicTalent]) -> ClassicTalent | None:
    """The Classic talent sharing the rank-1 spell, else the one with the same name; None when Classic has neither."""
    pool = list(candidates)
    by_spell = next((c for c in pool if c.rank_spells[0] == talent.spell), None)
    if by_spell is not None:
        return by_spell
    return next((c for c in pool if c.name and _normalised(c.name) == _normalised(talent.name)), None)


def _classic_text(book: SpellBook, spell: int) -> str | None:
    if not book.descriptions.get(spell):
        return None
    text = evaluate(book, spell, conditional_else=True)
    return None if unresolved_tokens(text) else re.sub(r"\s+", " ", text).strip()


def compare_with_classic(trees: Iterable[Tree], candidates: Iterable[ClassicTalent], classic: SpellBook) -> Comparison:
    """Each talent against its Classic match, rank for rank.

    A rank counts as changed only when Classic's text reads in full (no
    token left) and still differs; a rank Classic doesn't have isn't marked.
    """
    pool = list(candidates)
    out = Comparison()
    for tree in trees:
        for talent in tree.talents:
            match = match_classic(talent, pool)
            if match is None:
                out.new.add(talent.id)
                continue
            texts: list[str | None] = []
            for i, forever in enumerate(talent.ranks):
                was = _classic_text(classic, match.rank_spells[i]) if i < len(match.rank_spells) else None
                texts.append(was if was is not None and _normalised(forever) != _normalised(was) else None)
            if any(texts):
                out.changes[talent.id] = texts
    return out


def tree_doc(tree: Tree, new: set[int]) -> dict[str, object]:
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
                "spell": t.spell,
                "ranks": list(t.ranks),
                "prereqs": [list(p) for p in t.prereqs],
                **({"newInForever": True} if t.id in new else {}),
            }
            for t in tree.talents
        ],
    }
