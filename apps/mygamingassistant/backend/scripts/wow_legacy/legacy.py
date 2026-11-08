"""The Legacy system's trees, challenges and account rank rewards, for ``/wow-forever/legacy`` (pure).

Everything here is read from the Forever client's tables:

* **Trees**: the ``TraitTree`` rows of trait system 45 that have nodes (1118
  has none). The rows carry no names, so each tree is named after the talent
  only it holds (``TREE_SIGNATURES``); the three names are Blizzard's.
  ``TraitNode`` gives the grid position, ``TraitNodeXTraitNodeEntry`` →
  ``TraitNodeEntry`` → ``TraitDefinition`` → spell the name, max ranks and
  text. A node can list the same spell under several entries (Talented has
  five), so entries are de-duplicated by spell. A node flagged
  never-purchasable is a placeholder ("To be added in a future update.").
* **Gates**: ``TraitCond`` rows on the Legacy currency ("spend N in this tree")
  attached to node groups by ``TraitNodeGroupXTraitCond``; a node's gate is the
  highest one of the groups it is in (``TraitNodeGroupXTraitNode``).
* **Challenges**: ``TraitCurrencySource`` rows of the Legacy currency, each an
  achievement. The game lists each challenge twice (two ``SuperDistrictSetID``
  sets), so rows with the same text and achievement title are one challenge.
  Categories are the achievements' own ``Achievement_Category`` tree.
* **Rank rewards**: ``RenownRewards`` of the Legacy covenant, and the rank cap
  from ``CurrencyTypes`` ("Renown - Legacy Rank").

How a challenge turns into account rank, and whether a linked talent must be
filled before the next opens, are not in these tables.
"""
from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from math import gcd

from scripts.wow_changes.describe import clean_text

Row = Mapping[str, str]

LEGACY_SYSTEM_ID = 45
# "1 Legacy Point" — what one rank costs.
POINT_COST_ID = 4845
RANK_CURRENCY_ID = 3485
RANK_CURRENCY_NAME = "Renown - Legacy Rank"
RENOWN_COVENANT_ID = 48
# TraitNode.Flags: the node can't be bought (Forever's "Unknown" placeholders).
NEVER_PURCHASABLE_FLAG = 0x2
# TraitCond.CondType for "spend N of a currency in a node group".
SPENT_COND_TYPE = 0

# Blizzard's tree names, each matched to the talent only that tree holds.
TREE_SIGNATURES: dict[str, str] = {
    "Professions": "Working Overtime",
    "Adventure": "Thrill of Adventure",
    "Resourcefulness": "Reagent Economy",
}
TREE_ORDER = tuple(TREE_SIGNATURES)

_NEWLINE = re.compile(r"\|n", re.IGNORECASE)


def _int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


@dataclass(frozen=True)
class NodeEntry:
    entry_id: int
    spell: int
    max_ranks: int
    name_override: str
    icon_override: int


@dataclass(frozen=True)
class LegacyNode:
    node_id: int
    name: str
    spell: int
    icon: int
    max_ranks: int
    col: int
    row: int
    gate: int
    text: str | None
    coming_later: bool

    def as_doc(self) -> dict[str, object]:
        return {
            "id": self.node_id, "name": self.name, "spell": self.spell, "icon": self.icon,
            "maxRanks": self.max_ranks, "col": self.col, "row": self.row, "gate": self.gate,
            "text": self.text, "comingLater": self.coming_later,
        }


@dataclass(frozen=True)
class LegacyTree:
    tree_id: int
    name: str
    nodes: tuple[LegacyNode, ...]
    edges: tuple[tuple[int, int], ...]

    def as_doc(self) -> dict[str, object]:
        return {
            "id": self.tree_id, "name": self.name,
            "nodes": [n.as_doc() for n in self.nodes], "edges": [list(e) for e in self.edges],
        }


@dataclass(frozen=True)
class Challenge:
    key: str
    category: str
    group: str | None
    title: str
    text: str
    points: int
    icon: int
    achievements: tuple[int, ...]

    def as_doc(self) -> dict[str, object]:
        return {
            "id": self.key, "category": self.category, "group": self.group, "title": self.title,
            "text": self.text, "points": self.points, "icon": self.icon, "achievements": list(self.achievements),
        }


@dataclass(frozen=True)
class RankReward:
    rank: int
    name: str
    lines: tuple[str, ...]
    item_id: int
    icon: int

    def as_doc(self) -> dict[str, object]:
        return {"rank": self.rank, "name": self.name, "lines": list(self.lines), "itemId": self.item_id, "icon": self.icon}


def legacy_tree_ids(trees: Iterable[Row], nodes: Iterable[Row], system_id: int = LEGACY_SYSTEM_ID) -> list[int]:
    """The system's trees that have nodes, by id."""
    in_system = {_int(t["ID"]) for t in trees if _int(t["TraitSystemID"]) == system_id}
    with_nodes = {_int(n["TraitTreeID"]) for n in nodes}
    return sorted(in_system & with_nodes)


def legacy_currency(tree_currency: Iterable[Row], tree_ids: Iterable[int]) -> int:
    """The one currency every Legacy tree spends (``TraitTreeXTraitCurrency``)."""
    wanted = set(tree_ids)
    found = {_int(r["TraitCurrencyID"]) for r in tree_currency if _int(r["TraitTreeID"]) in wanted}
    if len(found) != 1:
        raise SystemExit(f"The Legacy trees {sorted(wanted)} spend {sorted(found)}, not one currency.")
    return found.pop()


def node_entries(
    links: Iterable[Row],
    entries: Mapping[int, Row],
    definitions: Mapping[int, Row],
    node_ids: Iterable[int],
) -> dict[int, list[NodeEntry]]:
    """Each node's entries in ``_Index`` order, one per spell (a node can list a spell more than once)."""
    wanted = set(node_ids)
    ordered = sorted(
        (r for r in links if _int(r["TraitNodeID"]) in wanted),
        key=lambda r: (_int(r["TraitNodeID"]), _int(r["_Index"]), _int(r["ID"])),
    )
    out: dict[int, list[NodeEntry]] = {n: [] for n in sorted(wanted)}
    for link in ordered:
        entry = entries.get(_int(link["TraitNodeEntryID"]))
        definition = definitions.get(_int(entry["TraitDefinitionID"])) if entry else None
        if entry is None or definition is None:
            continue
        spell = _int(definition["SpellID"])
        node = _int(link["TraitNodeID"])
        if any(e.spell == spell for e in out[node]):
            continue
        out[node].append(NodeEntry(
            _int(entry["ID"]), spell, _int(entry["MaxRanks"]),
            (definition.get("OverrideName_lang") or "").strip(), _int(definition.get("OverrideIcon")),
        ))
    return out


def node_gates(
    conds: Iterable[Row],
    group_conds: Iterable[Row],
    group_nodes: Iterable[Row],
    currency: int,
) -> dict[int, int]:
    """Node id -> points to spend in its tree before it opens (0 = open from the start)."""
    spent = {
        _int(c["ID"]): _int(c["SpentAmountRequired"])
        for c in conds
        if _int(c["TraitCurrencyID"]) == currency and _int(c["CondType"]) == SPENT_COND_TYPE
    }
    group_gate: dict[int, int] = defaultdict(int)
    for link in group_conds:
        amount = spent.get(_int(link["TraitCondID"]))
        if amount is not None:
            group = _int(link["TraitNodeGroupID"])
            group_gate[group] = max(group_gate[group], amount)
    gates: dict[int, int] = defaultdict(int)
    for link in group_nodes:
        group = _int(link["TraitNodeGroupID"])
        if group in group_gate:
            node = _int(link["TraitNodeID"])
            gates[node] = max(gates[node], group_gate[group])
    return dict(gates)


def grid_positions(nodes: Iterable[Row]) -> dict[int, tuple[int, int]]:
    """Node id -> (column, row) on one grid shared by every tree: positions over their spacing."""
    rows = list(nodes)
    xs = sorted({_int(n["PosX"]) for n in rows})
    ys = sorted({_int(n["PosY"]) for n in rows})

    def step(values: list[int]) -> int:
        found = 0
        for a, b in zip(values, values[1:]):
            found = gcd(found, b - a)
        return found or 1

    sx, sy = step(xs), step(ys)
    return {_int(n["ID"]): ((_int(n["PosX"]) - xs[0]) // sx, (_int(n["PosY"]) - ys[0]) // sy) for n in rows}


def name_trees(tree_names: Mapping[int, Iterable[str]]) -> dict[int, str]:
    """Tree id -> its name, from the signature talent it holds; stops unless each name fits one tree."""
    named: dict[int, str] = {}
    for name, signature in TREE_SIGNATURES.items():
        holders = [tree for tree, names in tree_names.items() if signature in set(names)]
        if len(holders) != 1:
            raise SystemExit(f"Legacy tree {name!r}: {len(holders)} trees hold {signature!r} (expected 1).")
        named[holders[0]] = name
    if set(named) != set(tree_names):
        raise SystemExit(f"Legacy trees without a name: {sorted(set(tree_names) - set(named))}")
    return named


def build_trees(
    tables: Mapping[str, Iterable[Row]],
    spell_names: Mapping[int, str],
    spell_icons: Mapping[int, int],
    spell_text: Callable[[int], str | None],
    system_id: int = LEGACY_SYSTEM_ID,
) -> tuple[list[LegacyTree], int]:
    """The named Legacy trees (``TREE_ORDER``) and the currency they spend."""
    all_nodes = list(tables["TraitNode"])
    tree_ids = legacy_tree_ids(tables["TraitTree"], all_nodes, system_id)
    currency = legacy_currency(tables["TraitTreeXTraitCurrency"], tree_ids)
    nodes = [n for n in all_nodes if _int(n["TraitTreeID"]) in set(tree_ids)]
    node_ids = [_int(n["ID"]) for n in nodes]
    entries = node_entries(
        tables["TraitNodeXTraitNodeEntry"],
        {_int(r["ID"]): r for r in tables["TraitNodeEntry"]},
        {_int(r["ID"]): r for r in tables["TraitDefinition"]},
        node_ids,
    )
    gates = node_gates(tables["TraitCond"], tables["TraitNodeGroupXTraitCond"], tables["TraitNodeGroupXTraitNode"], currency)
    positions = grid_positions(nodes)

    built: dict[int, list[LegacyNode]] = defaultdict(list)
    for n in nodes:
        node_id = _int(n["ID"])
        found = entries[node_id]
        if len(found) != 1:
            raise SystemExit(f"Legacy node {node_id} has {len(found)} different talents; the planner shows one per node.")
        entry = found[0]
        col, row = positions[node_id]
        built[_int(n["TraitTreeID"])].append(LegacyNode(
            node_id,
            entry.name_override or spell_names.get(entry.spell, ""),
            entry.spell,
            entry.icon_override or spell_icons.get(entry.spell, 0),
            entry.max_ranks,
            col,
            row,
            gates.get(node_id, 0),
            spell_text(entry.spell),
            bool(_int(n["Flags"]) & NEVER_PURCHASABLE_FLAG),
        ))
    names = name_trees({tree: [node.name for node in tree_nodes] for tree, tree_nodes in built.items()})
    edges: dict[int, list[tuple[int, int]]] = defaultdict(list)
    tree_of = {_int(n["ID"]): _int(n["TraitTreeID"]) for n in nodes}
    for e in tables["TraitEdge"]:
        left, right = _int(e["LeftTraitNodeID"]), _int(e["RightTraitNodeID"])
        if left in tree_of and tree_of.get(right) == tree_of[left]:
            edges[tree_of[left]].append((left, right))
    trees = [
        LegacyTree(
            tree,
            names[tree],
            tuple(sorted(built[tree], key=lambda node: (node.col, node.row, node.node_id))),
            tuple(sorted(edges[tree])),
        )
        for tree in sorted(built, key=lambda t: TREE_ORDER.index(names[t]))
    ]
    return trees, currency


def _category_path(category: int, categories: Mapping[int, Row]) -> list[Row]:
    """The category and its parents, top-level last."""
    path: list[Row] = []
    while (row := categories.get(category)) is not None and len(path) < 8:
        path.append(row)
        category = _int(row["Parent"])
    return path


def challenges(
    sources: Iterable[Row],
    achievements: Mapping[int, Row],
    categories: Mapping[int, Row],
    currency: int,
) -> list[Challenge]:
    """One challenge per text + achievement, its variants merged; rows worth no points are left out."""
    grouped: dict[tuple[str, str], list[tuple[Row, Row]]] = defaultdict(list)
    for source in sources:
        if _int(source["TraitCurrencyID"]) != currency or _int(source["Amount"]) <= 0:
            continue
        achievement = achievements.get(_int(source["AchievementID"]))
        if achievement is None:
            continue
        text = clean_text(source["Requirement_lang"])
        grouped[(text, achievement["Title_lang"].strip())].append((source, achievement))

    keyed: list[tuple[tuple[int, int, int], Challenge]] = []
    for (text, title), rows in grouped.items():
        first_source, first_achievement = min(rows, key=lambda pair: _int(pair[0]["ID"]))
        path = _category_path(_int(first_achievement["Category"]), categories)
        if not path:
            raise SystemExit(f"Legacy challenge {title!r}: achievement category {first_achievement['Category']} not found.")
        top, sub = path[-1], (path[0] if len(path) > 1 else None)
        ids = tuple(sorted({_int(a["ID"]) for _, a in rows}))
        challenge = Challenge(
            str(ids[0]),
            top["Name_lang"],
            sub["Name_lang"] if sub else None,
            title,
            text,
            max(_int(s["Amount"]) for s, _ in rows),
            _int(first_achievement["IconFileID"]),
            ids,
        )
        order = (_int(top["Ui_order"]), _int(sub["Ui_order"]) if sub else 0, _int(first_source["ID"]))
        keyed.append((order, challenge))
    return [c for _, c in sorted(keyed, key=lambda pair: pair[0])]


def reward_lines(description: str) -> tuple[str, ...]:
    """A reward's description as paragraphs, markup gone."""
    return tuple(line for line in (clean_text(p) for p in _NEWLINE.split(description)) if line)


def rank_rewards(rewards: Iterable[Row], covenant: int = RENOWN_COVENANT_ID) -> list[RankReward]:
    """The account rank's rewards in rank order."""
    out = [
        RankReward(
            _int(r["Level"]),
            (r.get("Name_lang") or "").strip() or (r.get("ToastDescription_lang") or "").strip(),
            reward_lines(r.get("Description_lang") or ""),
            _int(r.get("ItemID")),
            _int(r.get("Icon")),
        )
        for r in rewards
        if _int(r["CovenantID"]) == covenant
    ]
    return sorted(out, key=lambda reward: (reward.rank, reward.item_id))


def rank_cap(currencies: Mapping[int, Row], currency: int = RANK_CURRENCY_ID) -> int:
    """The highest account Legacy rank (``CurrencyTypes.MaxQty``)."""
    row = currencies.get(currency)
    if row is None or row["Name_lang"].strip() != RANK_CURRENCY_NAME:
        raise SystemExit(f"CurrencyTypes {currency} is not {RANK_CURRENCY_NAME!r}.")
    return _int(row["MaxQty"])


def point_cost(costs: Mapping[int, Row], currency: int, cost_id: int = POINT_COST_ID) -> int:
    """Points one rank costs (``TraitCost`` "1 Legacy Point")."""
    row = costs.get(cost_id)
    if row is None or _int(row["TraitCurrencyID"]) != currency:
        raise SystemExit(f"TraitCost {cost_id} is not a Legacy point cost.")
    return _int(row["Amount"])
