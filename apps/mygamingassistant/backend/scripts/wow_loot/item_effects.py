"""Writes MGA Loot's item effect values: what each equippable item's Use, Chance on hit and Equip spells are worth.

Every equippable item with an item effect (ItemXItemEffect → ItemEffect) gets a list of
``{stat, value, note}`` entries, worked out by ``effect_values.py`` (its docstring has every conversion).
The spell rows are Forever's own: the client tables with wago.tools' hotfixes and the operator's client
hotfix cache on top, so hotfix-only items and Forever's changed numbers are in. The one thing taken from
cmangos classic-db is a chance-on-hit spell's procs per minute when the client gives that spell no rate
at all (``item_template.spellppmRate``), and the note says "Classic rate".

Run from apps/mygamingassistant/backend:  python -m scripts.wow_loot.item_effects [--hotfix-cache PATH]
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from collections.abc import Iterator, Mapping
from pathlib import Path

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_items.client_ids import STAT_KEY_BY_CLIENT_ID
from scripts.wow_items.forever_items import ForeverTables, Row, hotfix_cache_path, load_forever_tables
from scripts.wow_items.formula import stat_lines
from scripts.wow_loot.effect_model import (
    ASSUMED_SECONDS_PER_HIT,
    NONE,
    TRIGGER_CHANCE_ON_HIT,
    UNRESOLVED,
    USE_TRIGGERS,
    WEAPON_CLASS,
    EffectRow,
    Entry,
    Item,
    ItemSpell,
    Spell,
)
from scripts.wow_loot.effect_values import item_entries
from scripts.wow_world_map.sources import CMANGOS_COMMIT, cmangos_dump
from scripts.wow_world_map.sql_dump import read_dump

OUT = WOW_DATA_DIR / "lootAddon" / "itemEffects.json"
TABLES = (
    "Item", "ItemSparse", "ItemEffect", "ItemXItemEffect", "SpellName", "SpellEffect", "SpellMisc",
    "SpellDuration", "SpellAuraOptions", "SpellProcsPerMinute", "SpellCooldowns", "SpellShapeshift",
    "SpellEquippedItems",
)
# Item.InventoryType values a character can wear (no shirts, tabards, bags or ammo).
EQUIPPABLE = frozenset({1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 25, 26, 28})
ITEM_EFFECT_TRIGGERS = USE_TRIGGERS | {1, TRIGGER_CHANCE_ON_HIT}
BASE_DIFFICULTY = "0"
CMANGOS_SPELL_SLOTS = range(1, 6)
# GetItemStats gives Forever's ratings; MGA Loot reads them as the chance keys below.
RATING_KEYS = {
    "hit_rating": "hit_pct", "crit_rating": "crit_pct", "dodge_rating": "dodge_pct", "parry_rating": "parry_pct",
    "block_rating": "block_pct", "haste_rating": "haste_pct", "expertise_rating": "expertise",
}


def _int(value: str | None) -> int:
    return int(float(value)) if value not in (None, "") else 0


def _float(value: str | None) -> float:
    return float(value) if value not in (None, "") else 0.0


def _by_spell(rows: list[Row]) -> dict[int, Row]:
    """One row per spell: the base-difficulty one when the table has difficulties."""
    out: dict[int, Row] = {}
    for row in rows:
        if row.get("DifficultyID", BASE_DIFFICULTY) == BASE_DIFFICULTY:
            out.setdefault(_int(row["SpellID"]), row)
    return out


class SpellBook(Mapping[int, Spell]):
    """Client spells as ``effect_values.Spell``, built when first asked for."""

    def __init__(self, tables: ForeverTables, classic_events: Mapping[int, tuple[float, float]]) -> None:
        self._classic_events = classic_events
        self._names = {_int(r["ID"]): r["Name_lang"] for r in tables.table("SpellName")}
        self._effects: dict[int, list[Row]] = {}
        for row in tables.table("SpellEffect"):
            if row["DifficultyID"] == BASE_DIFFICULTY:
                self._effects.setdefault(_int(row["SpellID"]), []).append(row)
        self._misc = _by_spell(tables.table("SpellMisc"))
        self._durations = {_int(r["ID"]): _int(r["Duration"]) for r in tables.table("SpellDuration")}
        self._aura_options = _by_spell(tables.table("SpellAuraOptions"))
        self._ppm = {_int(r["ID"]): _float(r["BaseProcRate"]) for r in tables.table("SpellProcsPerMinute")}
        self._cooldowns = _by_spell(tables.table("SpellCooldowns"))
        self._shapeshift = _by_spell(tables.table("SpellShapeshift"))
        self._equipped = _by_spell(tables.table("SpellEquippedItems"))
        self._built: dict[int, Spell] = {}

    def __getitem__(self, spell_id: int) -> Spell:
        if spell_id not in self._built:
            if spell_id not in self._names and spell_id not in self._effects:
                raise KeyError(spell_id)
            self._built[spell_id] = self._spell(spell_id)
        return self._built[spell_id]

    def __iter__(self) -> Iterator[int]:
        return iter(self._names)

    def __len__(self) -> int:
        return len(self._names)

    def _spell(self, spell_id: int) -> Spell:
        misc = self._misc.get(spell_id, {})
        options = self._aura_options.get(spell_id, {})
        cooldowns = self._cooldowns.get(spell_id, {})
        shapeshift = self._shapeshift.get(spell_id, {})
        equipped = self._equipped.get(spell_id, {})
        weapon_bits = None
        if _int(equipped.get("EquippedItemClass")) == WEAPON_CLASS and _int(equipped.get("EquippedItemSubclass")) > 0:
            weapon_bits = _int(equipped["EquippedItemSubclass"])
        rows = sorted(self._effects.get(spell_id, []), key=lambda r: _int(r["EffectIndex"]))
        classic_ppm, classic_chance = self._classic_events.get(spell_id, (0.0, 0.0))
        return Spell(
            id=spell_id,
            name=self._names.get(spell_id, f"spell {spell_id}"),
            school_mask=_int(misc.get("SchoolMask")),
            duration_ms=self._durations.get(_int(misc.get("DurationIndex")), 0),
            proc_chance=_float(options.get("ProcChance")),
            ppm=self._ppm.get(_int(options.get("SpellProcsPerMinuteID")), 0.0),
            proc_icd_ms=_int(options.get("ProcCategoryRecovery")),
            proc_charges=_int(options.get("ProcCharges")),
            cooldown_ms=_int(cooldowns.get("RecoveryTime")),
            category_cooldown_ms=_int(cooldowns.get("CategoryRecoveryTime")),
            shapeshift=_int(shapeshift.get("ShapeshiftMask_0")) != 0 or _int(shapeshift.get("ShapeshiftMask_1")) != 0,
            weapon_bits=weapon_bits,
            classic_ppm=classic_ppm,
            classic_chance=classic_chance,
            effects=tuple(
                EffectRow(
                    effect=_int(r["Effect"]),
                    aura=_int(r["EffectAura"]),
                    base=_float(r["EffectBasePointsF"]),
                    misc=_int(r["EffectMiscValue_0"]),
                    period_ms=_int(r["EffectAuraPeriod"]),
                    trigger=_int(r["EffectTriggerSpell"]),
                    target=_int(r["ImplicitTarget_0"]),
                    target2=_int(r["ImplicitTarget_1"]),
                )
                for r in rows
            ),
        )


def classic_item_procs(item_template: list[dict]) -> dict[int, list[tuple[int, float]]]:
    """Item id -> ``(spell id, procs per minute)`` for each cmangos chance-on-hit item spell (0 = no rate)."""
    procs: dict[int, list[tuple[int, float]]] = {}
    for row in item_template:
        for slot in CMANGOS_SPELL_SLOTS:
            spell = int(row.get(f"spellid_{slot}") or 0)
            if spell and int(row.get(f"spelltrigger_{slot}") or 0) == TRIGGER_CHANCE_ON_HIT:
                procs.setdefault(int(row["entry"]), []).append((spell, float(row.get(f"spellppmRate_{slot}") or 0)))
    return procs


def classic_item_ppm(item_id: int, spell_id: int, forever_procs: int, classic: Mapping[int, list[tuple[int, float]]]) -> float:
    """The Classic procs per minute for an item's chance-on-hit spell, or 0.

    The same spell id first. Forever renumbered some proc spells (Teebu's Blazing Longsword: 18086 → 1300753),
    so an item with exactly one chance on hit on both sides takes Classic's rate for it.
    """
    procs = classic.get(item_id, [])
    for spell, ppm in procs:
        if spell == spell_id:
            return ppm
    return procs[0][1] if len(procs) == 1 and forever_procs == 1 else 0.0


def classic_proc_events(spell_proc_event: list[dict]) -> dict[int, tuple[float, float]]:
    """Spell id -> ``(ppmRate, CustomChance)`` from cmangos spell_proc_event, for proc auras with either."""
    events: dict[int, tuple[float, float]] = {}
    for row in spell_proc_event:
        ppm, chance = float(row.get("ppmRate") or 0), float(row.get("CustomChance") or 0)
        if ppm > 0 or chance > 0:
            events[int(row["entry"])] = (ppm, chance)
    return events


def sparse_stat_keys(sparse: Row) -> frozenset[str]:
    keys = set()
    for stat_id, _ in stat_lines(sparse):
        key = STAT_KEY_BY_CLIENT_ID.get(stat_id)
        if key:
            keys.add(RATING_KEYS.get(key, key))
    return frozenset(keys)


def item_effect_spells(tables: ForeverTables, classic: Mapping[int, list[tuple[int, float]]]) -> dict[int, list[ItemSpell]]:
    """Item id -> its effects in tooltip order."""
    effects = tables.rows["ItemEffect"]
    by_item: dict[int, list[Row]] = {}
    for link in tables.table("ItemXItemEffect"):
        effect = effects.get(_int(link["ItemEffectID"]))
        if effect and _int(effect["SpellID"]) and _int(effect["TriggerType"]) in ITEM_EFFECT_TRIGGERS:
            by_item.setdefault(_int(link["ItemID"]), []).append(effect)
    out: dict[int, list[ItemSpell]] = {}
    for item_id, rows in by_item.items():
        procs = sum(1 for r in rows if _int(r["TriggerType"]) == TRIGGER_CHANCE_ON_HIT)
        out[item_id] = [
            ItemSpell(
                spell_id=_int(r["SpellID"]),
                trigger=_int(r["TriggerType"]),
                cooldown_ms=max(0, _int(r["CoolDownMSec"])),
                category_cooldown_ms=max(0, _int(r["CategoryCoolDownMSec"])),
                classic_ppm=(
                    classic_item_ppm(item_id, _int(r["SpellID"]), procs, classic)
                    if _int(r["TriggerType"]) == TRIGGER_CHANCE_ON_HIT else 0.0
                ),
            )
            for r in sorted(rows, key=lambda r: (_int(r["LegacySlotIndex"]), _int(r["ID"])))
        ]
    return out


def build_effects(
    tables: ForeverTables,
    classic_items: Mapping[int, list[tuple[int, float]]],
    classic_events: Mapping[int, tuple[float, float]],
) -> dict[int, list[Entry]]:
    book = SpellBook(tables, classic_events)
    items = tables.rows["Item"]
    sparse = tables.rows["ItemSparse"]
    out: dict[int, list[Entry]] = {}
    for item_id, spells in sorted(item_effect_spells(tables, classic_items).items()):
        item_row, sparse_row = items.get(item_id), sparse.get(item_id)
        if not item_row or not sparse_row or _int(item_row["InventoryType"]) not in EQUIPPABLE:
            continue
        delay = _int(sparse_row.get("ItemDelay"))
        item = Item(
            id=item_id,
            weapon_speed=delay / 1000 if _int(item_row["ClassID"]) == WEAPON_CLASS and delay > 0 else None,
            stat_keys=sparse_stat_keys(sparse_row),
        )
        entries = item_entries(item, spells, book)
        if entries:
            out[item_id] = entries
    return out


def summary(effects: Mapping[int, list[Entry]]) -> Counter[str]:
    kinds: Counter[str] = Counter()
    for entries in effects.values():
        stats = {e.stat for e in entries}
        if UNRESOLVED in stats:
            kinds["unresolved"] += 1
        elif stats == {NONE}:
            kinds["no combat value"] += 1
        else:
            kinds["scored"] += 1
    return kinds


def write_effects(path: Path, payload: dict) -> None:
    """The JSON with one item per line, so a diff shows which items changed."""
    items = payload.pop("items")
    head = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))[:-1]
    rows = ",\n".join(
        f"{json.dumps(item_id)}:{json.dumps(entries, ensure_ascii=False, separators=(',', ':'))}"
        for item_id, entries in items.items()
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'{head},"items":{{\n{rows}\n}}}}\n', encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MGA Loot's item effect values.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    args = parser.parse_args()
    tables = load_forever_tables(hotfix_cache_path(args.hotfix_cache), TABLES)
    dump = read_dump(cmangos_dump(), {"item_template", "spell_proc_event"})
    effects = build_effects(tables, classic_item_procs(dump["item_template"]), classic_proc_events(dump["spell_proc_event"]))
    write_effects(OUT, {
        "source": f"{tables.source()}; proc rates the client lacks from cmangos/classic-db@{CMANGOS_COMMIT}",
        "assumedSecondsPerHit": ASSUMED_SECONDS_PER_HIT,
        "note": (
            "Item id -> what its Use, Chance on hit and Equip effects are worth in MGA Loot's stat-weight keys. "
            "dps = weighed like weapon DPS; dps_pct = share of weapon DPS (extra attacks); ranged_* = counted only "
            "for ranged weights; none = no combat value; unresolved = MGA Loot can't judge it. "
            f"A non-weapon's chance per hit assumes a hit every {ASSUMED_SECONDS_PER_HIT}s."
        ),
        "items": {
            str(item_id): [{"stat": e.stat, "value": e.value, "note": e.note} for e in entries]
            for item_id, entries in effects.items()
        },
    })
    print(f"{len(effects):,} items with effect data: " + ", ".join(f"{n:,} {k}" for k, n in summary(effects).most_common()))


if __name__ == "__main__":
    main()
