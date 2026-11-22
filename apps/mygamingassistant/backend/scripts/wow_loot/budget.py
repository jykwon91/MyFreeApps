"""The item-level stat budget MGA Loot estimates an effect from when the data can't value the effect itself.

An item's effect is paid for out of the same budget as its stats, so an effect is worth about the stat points
the item lacks next to an item of its kind with no effect at all:

* **Samples:** every equippable Forever item that has no effect (no ``ItemXItemEffect`` row, and its cmangos
  ``item_template`` row has no spell), isn't a random-suffix item (``RandomProperty``) and isn't a developer
  or placeholder item (``JUNK_NAME``). An item missing from cmangos is skipped: Classic's row is what says it
  has no spell. Its **stat points** are the sum of its tooltip stats (``formula.stat_values``), without
  armor, mana and health, whose amounts aren't on the stat scale.
* **Cells:** the median stat points per (slot group, quality, item level), slot groups as in ``SLOT_GROUPS``.
  Only uncommon and better items carry a budget (the client's ``RandPropPoints`` has none below).
* **Thin cells:** a cell needs ``MIN_SAMPLE`` items. With fewer, the window widens one item level each side
  at a time until it has them, and each neighbour counts at this level's budget (its points × the client's
  ``RandPropPoints`` here / there, the same slot column and quality). A slot group with fewer than
  ``MIN_SAMPLE`` items at that quality in all borrows the groups sharing its ``RandPropPoints`` column
  (trinkets → shoulders, hands, feet and waist), and legendaries borrow epics (they use the epic budget).
* **An item's effect** = max(0, budget − its own stat points), in stat points. MGA Loot weighs a stat point
  at the class's average weight over the five primary stats it values.
"""
from __future__ import annotations

import statistics
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from scripts.wow_items.build import JUNK_NAME
from scripts.wow_items.client_ids import BUDGET_QUALITY, BUDGET_SLOT_BY_INVENTORY_TYPE
from scripts.wow_items.formula import BudgetTables, stat_values

Row = Mapping[str, str]

# InventoryType -> slot group.
SLOT_GROUPS: dict[int, str] = {
    1: "head_chest_legs", 5: "head_chest_legs", 7: "head_chest_legs", 20: "head_chest_legs",
    3: "shoulder_hands_feet_waist", 6: "shoulder_hands_feet_waist", 8: "shoulder_hands_feet_waist",
    10: "shoulder_hands_feet_waist",
    2: "wrist_neck_finger_back", 9: "wrist_neck_finger_back", 11: "wrist_neck_finger_back",
    16: "wrist_neck_finger_back",
    12: "trinket",
    13: "one_hand", 21: "one_hand", 22: "one_hand",
    17: "two_hand",
    15: "ranged", 25: "ranged", 26: "ranged", 28: "ranged",
    14: "off_hand", 23: "off_hand",
}
MIN_SAMPLE = 5
# Client stat ids left out of stat points: mana, health, extra armor.
NOT_POINTS = frozenset({0, 1, 50})
BUDGET_QUALITIES = tuple(sorted(BUDGET_QUALITY))
MAX_BUDGET_LEVEL = 100
CMANGOS_SPELL_SLOTS = range(1, 6)


@dataclass(frozen=True)
class Sample:
    group: str
    quality: int
    level: int
    column: int
    points: int


def _int(value: object) -> int:
    try:
        return int(float(value or 0))  # type: ignore[arg-type]
    except ValueError:
        return 0


def stat_points(values: Mapping[int, int]) -> int:
    return sum(amount for stat_id, amount in values.items() if stat_id not in NOT_POINTS)


def _no_classic_spell(row: Row) -> bool:
    return not any(_int(row.get(f"spellid_{slot}")) for slot in CMANGOS_SPELL_SLOTS) and _int(row.get("RandomProperty")) == 0


def budget_samples(
    sparse_rows: Iterable[Row], tables: BudgetTables, effect_items: set[int], classic_items: Mapping[int, Row],
) -> list[Sample]:
    samples = []
    for sparse in sparse_rows:
        item_id = _int(sparse["ID"])
        inventory_type = _int(sparse["InventoryType"])
        quality = _int(sparse["OverallQualityID"])
        classic = classic_items.get(item_id)
        if (
            item_id in effect_items or classic is None or not _no_classic_spell(classic)
            or inventory_type not in SLOT_GROUPS or quality not in BUDGET_QUALITY
            or JUNK_NAME.search((sparse.get("Display_lang") or "").strip())
        ):
            continue
        values = stat_values(sparse, tables)
        if values is None:
            continue
        samples.append(Sample(
            SLOT_GROUPS[inventory_type], quality, _int(sparse["ItemLevel"]),
            BUDGET_SLOT_BY_INVENTORY_TYPE[inventory_type], stat_points(values),
        ))
    return samples


class Budget:
    """Median stat points of no-effect items, per slot group, quality and item level."""

    def __init__(self, samples: Iterable[Sample], rand_prop_points: Mapping[int, Row]) -> None:
        self._samples = list(samples)
        self._points = rand_prop_points
        self._columns = {s.group: s.column for s in self._samples}
        for inventory_type, group in SLOT_GROUPS.items():
            self._columns.setdefault(group, BUDGET_SLOT_BY_INVENTORY_TYPE[inventory_type])

    def _scale(self, quality: int, column: int, level: int) -> float:
        row = self._points.get(level)
        return float(row[f"{BUDGET_QUALITY[quality]}F_{column}"]) if row else 0.0

    def _pool(self, group: str, quality: int) -> list[Sample]:
        column = self._columns[group]
        same_budget = [s for s in self._samples if BUDGET_QUALITY[s.quality] == BUDGET_QUALITY[quality]]
        for pool in (
            [s for s in same_budget if s.group == group and s.quality == quality],
            [s for s in same_budget if s.group == group],
            [s for s in same_budget if s.column == column and s.quality == quality],
            [s for s in same_budget if s.column == column],
        ):
            if len(pool) >= MIN_SAMPLE:
                return pool
        return pool

    def points(self, group: str, quality: int, level: int) -> float | None:
        """The budget in stat points; None for a quality or slot with no budget."""
        if group not in self._columns or quality not in BUDGET_QUALITY:
            return None
        here = self._scale(quality, self._columns[group], level)
        pool = [s for s in self._pool(group, quality) if self._scale(quality, s.column, s.level) > 0]
        if here <= 0 or not pool:
            return None
        widest = max(abs(s.level - level) for s in pool)
        for spread in range(widest + 1):
            window = [s for s in pool if abs(s.level - level) <= spread]
            if len(window) >= MIN_SAMPLE or spread == widest:
                return statistics.median(s.points * here / self._scale(quality, s.column, s.level) for s in window)
        return None

    def table(self) -> dict[str, dict[int, dict[int, int]]]:
        """Slot group -> quality -> item level -> budget, rounded, for every level the client has a budget for."""
        out: dict[str, dict[int, dict[int, int]]] = {}
        for group in sorted(set(SLOT_GROUPS.values())):
            for quality in BUDGET_QUALITIES:
                levels = {}
                for level in range(1, MAX_BUDGET_LEVEL + 1):
                    points = self.points(group, quality, level)
                    if points is not None:
                        levels[level] = round(points)
                if levels:
                    out.setdefault(group, {})[quality] = levels
        return out


def effect_points(sparse: Row, tables: BudgetTables, budget: Budget) -> int | None:
    """The stat points an item lacks next to its budget, or None when the item has no budget."""
    group = SLOT_GROUPS.get(_int(sparse["InventoryType"]))
    values = stat_values(sparse, tables)
    if group is None or values is None:
        return None
    points = budget.points(group, _int(sparse["OverallQualityID"]), _int(sparse["ItemLevel"]))
    if points is None:
        return None
    return max(0, round(points - stat_points(values)))
