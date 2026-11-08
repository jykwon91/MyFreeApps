"""Item changes: gear Forever re-numbered, and items new in Forever (pure).

The Forever side is the item list the compare page already uses
(``data/items/items.json``, hotfix layers included); the Classic side is the
Classic Era client's ``ItemSparse`` (with wago.tools' hotfixes). Only what
both clients encode the same way is compared: name, quality, item level,
required level, armor, weapon damage and speed, and the primary stats
(``COMPARED_STAT_IDS``). Forever's hit, crit, spell power and the like are
ratings in its ItemSparse but equip spells in Classic's, so they're never
compared — the page says so.

An item id the Classic Era client doesn't have is new. Gear from the item
list links to its item page; new consumables and recipes have no page and
are listed by name only.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from scripts.wow_changes.describe import describe_value
from scripts.wow_changes.entry import KIND_CHANGED, KIND_NEW, Change, Row
from scripts.wow_items.build import JUNK_NAME
from scripts.wow_items.client_ids import QUALITY_BY_ID, STAT_KEY_BY_CLIENT_ID

SparseRow = Mapping[str, str]
ItemRecord = Mapping[str, Any]

# mana, health, agility, strength, intellect, spirit, stamina
COMPARED_STAT_IDS = (0, 1, 3, 4, 5, 6, 7)
COMPARED_STATS = tuple(STAT_KEY_BY_CLIENT_ID[i] for i in COMPARED_STAT_IDS)
STAT_SLOTS = 10
# ItemClass ids of the new non-gear items worth listing.
ITEM_CLASS_CONSUMABLE = 0
ITEM_CLASS_RECIPE = 9
LISTED_ITEM_CLASSES = {ITEM_CLASS_CONSUMABLE: "consumable", ITEM_CLASS_RECIPE: "recipe"}
# Changes named in a summary before the rest are counted.
MAX_SUMMARY_PARTS = 2


def _int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return int(float(value or 0))


def stat_label(key: str) -> str:
    return key.replace("_", " ").capitalize()


def classic_stats(row: SparseRow) -> dict[str, int]:
    """The primary stats on a Classic Era ItemSparse row, by the compare page's stat keys."""
    stats: dict[str, int] = {}
    for i in range(STAT_SLOTS):
        stat = _int(row.get(f"StatModifier_bonusStat_{i}"))
        amount = _int(row.get(f"StatModifier_bonusAmount_{i}"))
        if stat in COMPARED_STAT_IDS and amount:
            key = STAT_KEY_BY_CLIENT_ID[stat]
            stats[key] = stats.get(key, 0) + amount
    return stats


def _speed(value: float) -> str:
    return f"{value:.2f}"


def _damage(weapon: list[float]) -> str:
    return f"{int(weapon[0])}–{int(weapon[1])}"


def _value_rows(label: str, old: int | None, new: int | None) -> tuple[Row, str] | None:
    if old == new:
        return None
    if old is None or new is None:
        return (label, None if old is None else str(old), None if new is None else str(new)), (
            f"{label} added: {new}." if old is None else f"{label} removed."
        )
    return (label, str(old), str(new)), describe_value(label, old, new)


def _summary(sentences: list[str]) -> str:
    shown = " ".join(sentences[:MAX_SUMMARY_PARTS])
    rest = len(sentences) - MAX_SUMMARY_PARTS
    if rest > 0:
        return f"{shown} {rest} more change{'s' if rest > 1 else ''}."
    return shown


def compare_item(item: ItemRecord, classic: SparseRow) -> list[tuple[Row, str]]:
    """Each difference between an item-list record and its Classic Era row: the side-by-side row and a sentence."""
    out: list[tuple[Row, str]] = []
    old_name = (classic.get("Display_lang") or "").strip()
    if old_name and old_name != item["name"]:
        out.append((("Name", old_name, item["name"]), f"Renamed from {old_name}."))
    old_quality = QUALITY_BY_ID.get(_int(classic.get("OverallQualityID")))
    if old_quality and old_quality != item["quality"]:
        out.append((("Quality", old_quality.capitalize(), item["quality"].capitalize()),
                    f"Quality changed from {old_quality} to {item['quality']}."))
    for label, old, new in (
        ("Item level", _int(classic.get("ItemLevel")), item["itemLevel"]),
        ("Required level", _int(classic.get("RequiredLevel")), item["requiredLevel"]),
    ):
        found = _value_rows(label, old, new)
        if found:
            out.append(found)
    if item["armor"] is not None:
        found = _value_rows("Armor", _int(classic.get("Resistances_0")) or None, item["armor"])
        if found:
            out.append(found)
    weapon = item["weapon"]
    if weapon is not None:
        old_weapon = [_int(classic.get("MinDamage_0")), _int(classic.get("MaxDamage_0")), _int(classic.get("ItemDelay")) / 1000]
        if old_weapon[:2] != [int(weapon[0]), int(weapon[1])]:
            out.append((("Damage", _damage(old_weapon), _damage(weapon)),
                        f"Damage changed from {_damage(old_weapon)} to {_damage(weapon)}."))
        if _speed(old_weapon[2]) != _speed(weapon[2]):
            out.append((("Speed", _speed(old_weapon[2]), _speed(weapon[2])),
                        f"Speed changed from {_speed(old_weapon[2])} to {_speed(weapon[2])}."))
    old_stats = classic_stats(classic)
    for key in COMPARED_STATS:
        found = _value_rows(stat_label(key), old_stats.get(key), item["stats"].get(key))
        if found:
            out.append(found)
    return out


def _item_change(item: ItemRecord, kind: str, rows: tuple[Row, ...], summary: str) -> Change:
    return Change(
        key=f"item:{item['id']}",
        kind=kind,
        name=item["name"],
        summary=summary,
        rows=rows,
        classes=tuple(item["classes"] or ()),
        link=("item", item["id"]),
        icon=("item", item["id"]),
    )


def _new_gear(item: ItemRecord) -> Change:
    """A one-line summary only: the item page linked from the row has the rest."""
    slot = item["slot"].replace("_", " ")
    item_type = f" ({item['itemType'].lower()})" if item["itemType"] else ""
    required = f", requires level {item['requiredLevel']}" if item["requiredLevel"] else ""
    summary = f"New {item['quality']} {slot}{item_type}, item level {item['itemLevel']}{required}."
    return _item_change(item, KIND_NEW, (), summary)


def item_changes(items: Iterable[ItemRecord], classic_by_id: Mapping[int, SparseRow]) -> list[Change]:
    """Every item-list record Forever changed or added, in the item list's order."""
    out = []
    for item in items:
        classic = classic_by_id.get(item["id"])
        if classic is None:
            out.append(_new_gear(item))
            continue
        found = compare_item(item, classic)
        if found:
            out.append(_item_change(item, KIND_CHANGED, tuple(r for r, _ in found), _summary([s for _, s in found])))
    return out


def new_other_items(
    sparse: Iterable[SparseRow],
    item_class: Mapping[int, int],
    classic_ids: set[int],
    listed: set[int],
) -> tuple[list[Change], int]:
    """Consumables and recipes the Classic Era client doesn't have (gear is covered by the item list),
    and how many other new items (quest items, trade goods, gear the item list leaves out) aren't listed."""
    out = []
    unlisted = 0
    for row in sparse:
        item_id = _int(row.get("ID"))
        name = (row.get("Display_lang") or "").strip()
        if item_id in classic_ids or item_id in listed or not name or JUNK_NAME.search(name):
            continue
        kind = LISTED_ITEM_CLASSES.get(item_class.get(item_id, -1))
        if kind is None:
            unlisted += 1
            continue
        out.append(Change(key=f"item:{item_id}", kind=KIND_NEW, name=name, summary=f"New {kind}."))
    return sorted(out, key=lambda c: c.name), unlisted
