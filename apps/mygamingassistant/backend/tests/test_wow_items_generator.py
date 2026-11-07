"""WoW Forever item list generator — the client formulas and the committed data.

Pinned values are Forever tooltips: Dark Iron Plate 12 Sta / 19 fire resistance
/ 817 armor; Enchanted Thorium Helm 25 Sta / 12 Str / 9 defense / 526 armor;
Lionheart Helm 18 Str / crit 28 / hit 20 / 565 armor; Conservator Helm 22 Sta /
20 Spi / 262 armor; Crusader's Gloves (Forever-only) 5 Sta / 3 Str / 5 spell
power / 115 armor; Darkspear Warding Pendant 13 Sta / 9 Int; Bronze Mace 20-38
at 2.60 and Cragwood Maul 83-125 at 2.80 (both differ from Classic); Anathema
and Benediction (caster staves) and Thunderfury (legendary) don't follow the
damage tables, so their damage must stay blank.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.schemas.wow.extracted_item import ITEM_QUALITIES, ITEM_SLOTS
from app.services.wow.stat_keys import STAT_KEYS
from scripts.wow_items.build import COLUMNS, JUNK_NAME, build_record, class_list, map_stats
from scripts.wow_items.client_ids import STAT_KEY_BY_CLIENT_ID
from scripts.wow_items.formula import BudgetTables, armor_value, round_half_up, stat_values, weapon_damage

ITEMS_DIR = Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "items"
CLASS_IDS = {"warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"}


def _sparse(**overrides: Any) -> dict[str, str]:
    row = {
        "ID": "1", "Display_lang": "Sturdy Helm", "OverallQualityID": "3", "InventoryType": "1",
        "ItemLevel": "60", "RequiredLevel": "55", "QualityModifier": "0", "AllowableClass": "-1",
        "Flags_4": "0", "ItemDelay": "0", "DmgVariance": "0",
    }
    for i in range(10):
        row[f"StatModifier_bonusStat_{i}"] = "-1"
        row[f"StatPercentEditor_{i}"] = "0"
    row.update({k: str(v) for k, v in overrides.items()})
    return row


def _stats(*lines: tuple[int, int]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i, (stat, pct) in enumerate(lines):
        out[f"StatModifier_bonusStat_{i}"] = str(stat)
        out[f"StatPercentEditor_{i}"] = str(pct)
    return out


@pytest.fixture
def tables() -> BudgetTables:
    budget = {f"{q}F_{s}": str(v) for q, vals in {
        "Good": (26, 20, 15, 11, 8), "Superior": (34, 26, 19, 15, 11), "Epic": (44, 33, 25, 18, 14),
    }.items() for s, v in enumerate(vals)}
    return BudgetTables(
        rand_prop_points={60: budget},
        armor_quality={60: {f"Qualitymod_{q}": m for q, m in enumerate(["0", "1", "1", "1.1", "1.2", "1.2", "1", "1"])}},
        armor_shield={60: {f"Quality_{q}": str(v) for q, v in enumerate([0, 0, 1500, 1800, 2100, 2100, 0, 0])}},
        armor_total={60: {"Cloth": "100", "Leather": "200", "Mail": "400", "Plate": "700"}},
        armor_location={
            1: {"Clothmodifier": "0.13", "Leathermodifier": "0.13", "Chainmodifier": "0.13", "Platemodifier": "0.13"},
            5: {"Clothmodifier": "0.16", "Leathermodifier": "0.16", "Chainmodifier": "0.16", "Platemodifier": "0.16"},
            16: {"Clothmodifier": "0.07", "Leathermodifier": "0.07", "Chainmodifier": "0.07", "Platemodifier": "0.07"},
        },
        damage={name: {60: {f"Quality_{q}": "40" for q in range(8)}} for name in (
            "ItemDamageOneHand", "ItemDamageTwoHand", "ItemDamageRanged", "ItemDamageWand", "ItemDamageThrown",
        )},
    )


ARMOR_ITEM = {"ClassID": "4", "SubclassID": "4"}
SWORD = {"ClassID": "2", "SubclassID": "7"}
WAND = {"ClassID": "2", "SubclassID": "19"}


def test_round_half_up() -> None:
    assert [round_half_up(x) for x in (2.5, 3.5, 3.49, 0.5)] == [3, 4, 3, 1]


def test_stats_are_budget_times_percent(tables: BudgetTables) -> None:
    # Superior head: budget 34. 5000 → 17, 2059 → 7.0006 → 7, 1324 → 4.5016 → 5.
    row = _sparse(**_stats((7, 5000), (4, 2059), (32, 1324)))
    assert stat_values(row, tables) == {7: 17, 4: 7, 32: 5}


def test_stats_use_the_slot_group_and_quality(tables: BudgetTables) -> None:
    neck = _sparse(InventoryType=2, OverallQualityID=4, **_stats((7, 10000)))
    assert stat_values(neck, tables) == {7: 25}
    legendary_ring = _sparse(InventoryType=11, OverallQualityID=5, **_stats((7, 10000)))
    assert stat_values(legendary_ring, tables) == {7: 25}


def test_stats_without_a_budget_are_unknown_not_zero(tables: BudgetTables) -> None:
    assert stat_values(_sparse(ItemLevel=99, **_stats((7, 5000))), tables) is None
    assert stat_values(_sparse(), tables) == {}


def test_extra_armor_is_not_a_stat(tables: BudgetTables) -> None:
    assert stat_values(_sparse(**_stats((50, 3000), (7, 5000))), tables) == {7: 17}


def test_armor_material_location_and_quality(tables: BudgetTables) -> None:
    # Plate head: 700 × 0.13 × 1.1 = 100.1 → 100, plus 20 extra armor.
    assert armor_value(_sparse(QualityModifier=20), ARMOR_ITEM, tables) == 120
    robe = _sparse(InventoryType=20)  # robes use the chest location
    assert armor_value(robe, {"ClassID": "4", "SubclassID": "1"}, tables) == round_half_up(100 * 0.16 * 1.1)
    cloak = _sparse(InventoryType=16)  # cloaks are cloth whatever the subclass says
    assert armor_value(cloak, ARMOR_ITEM, tables) == round_half_up(100 * 0.07 * 1.1)
    shield = _sparse(InventoryType=14)
    assert armor_value(shield, {"ClassID": "4", "SubclassID": "6"}, tables) == 1800
    assert armor_value(_sparse(), SWORD, tables) is None


def test_weapon_damage_min_floors_max_rounds(tables: BudgetTables) -> None:
    # 40 dps × 2.6 s = 104 average; variance 0.6 → 72.8 / 135.2.
    sword = _sparse(InventoryType=13, ItemDelay=2600, DmgVariance="0.6000000238")
    damage = weapon_damage(sword, SWORD, tables)
    assert damage is not None
    assert (damage.min_damage, damage.max_damage, damage.speed) == (72, 135, 2.6)


def test_caster_and_legendary_weapons_get_no_damage(tables: BudgetTables) -> None:
    flagged = _sparse(InventoryType=17, ItemDelay=3000, DmgVariance="0.4", Flags_4=0x100)
    assert weapon_damage(flagged, SWORD, tables) is None
    spell_stat = _sparse(InventoryType=17, ItemDelay=3000, DmgVariance="0.4", **_stats((45, 2000)))
    assert weapon_damage(spell_stat, SWORD, tables) is None
    legendary = _sparse(InventoryType=13, ItemDelay=1900, DmgVariance="0.6", OverallQualityID=5)
    assert weapon_damage(legendary, SWORD, tables) is None
    wand = _sparse(InventoryType=26, ItemDelay=1500, DmgVariance="0.4", **_stats((45, 2000)))
    assert weapon_damage(wand, WAND, tables) is not None


def test_unknown_stat_ids_are_counted_not_dropped() -> None:
    assert map_stats({7: 10, 46: 4, 83: 1}) == ({"stamina": 10}, 2)


def test_class_restrictions() -> None:
    assert class_list(_sparse()) is None
    assert class_list(_sparse(AllowableClass=1535)) is None
    assert class_list(_sparse(AllowableClass=16)) == ["priest"]
    assert class_list(_sparse(AllowableClass=1 | 2)) == ["warrior", "paladin"]


def test_records_skip_junk_and_statless_items(tables: BudgetTables) -> None:
    def record(**kw: Any) -> list[Any] | None:
        return build_record(_sparse(**kw), ARMOR_ITEM, tables, {}, set())

    assert record(**_stats((7, 5000))) is not None
    assert record() is None
    assert record(OverallQualityID=1, **_stats((7, 5000))) is None
    assert record(Display_lang="Monster - Sword", **_stats((7, 5000))) is None
    assert record(Display_lang="2500 Test 2h Axe 60 blue", **_stats((7, 5000))) is None
    assert record(InventoryType=19, **_stats((7, 5000))) is None
    suffix = build_record(_sparse(ID=7), ARMOR_ITEM, tables, {}, {7})
    assert suffix is not None and suffix[COLUMNS.index("stats")] == {}


def test_client_stat_ids_map_to_known_stat_keys() -> None:
    assert set(STAT_KEY_BY_CLIENT_ID.values()) <= set(STAT_KEYS)


# --- the committed output -------------------------------------------------


@pytest.fixture(scope="module")
def items() -> dict[int, dict[str, Any]]:
    document = json.loads((ITEMS_DIR / "items.json").read_text(encoding="utf-8"))
    assert document["columns"] == COLUMNS
    assert "Blizzard Entertainment" in document["attribution"]
    return {row[0]: dict(zip(COLUMNS, row, strict=True)) for row in document["items"]}


@pytest.mark.parametrize(("item_id", "stats", "armor"), [
    (11604, {"stamina": 12, "fire_resistance": 19}, 817),
    (12620, {"stamina": 25, "strength": 12, "defense": 9}, 526),
    (12640, {"strength": 18, "crit_rating": 28, "hit_rating": 20}, 565),
    (12018, {"stamina": 22, "spirit": 20}, 262),
    (250512, {"stamina": 5, "strength": 3, "spell_power": 5}, 115),
    (272073, {"stamina": 13, "intellect": 9}, None),
])
def test_pinned_items(items: dict[int, dict[str, Any]], item_id: int, stats: dict[str, int], armor: int | None) -> None:
    assert items[item_id]["stats"] == stats
    assert items[item_id]["armor"] == armor


@pytest.mark.parametrize(("item_id", "weapon"), [(2848, [20, 38, 2.6]), (11265, [83, 125, 2.8])])
def test_pinned_weapons(items: dict[int, dict[str, Any]], item_id: int, weapon: list[float]) -> None:
    assert items[item_id]["weapon"] == weapon
    assert items[item_id]["damageUnknown"] == 0


@pytest.mark.parametrize("item_id", [18608, 18609, 19019])
def test_unreproducible_damage_is_blank(items: dict[int, dict[str, Any]], item_id: int) -> None:
    assert items[item_id]["weapon"] is None
    assert items[item_id]["damageUnknown"] == 1


def test_items_the_client_gets_only_as_hotfixes_are_listed(items: dict[int, dict[str, Any]]) -> None:
    # Not in the Forever client file at all; the server sends them as hotfixes.
    assert items[11815]["name"] == "Hand of Justice"
    assert items[2245]["stats"] == {"agility": 13, "spirit": 18, "stamina": 32}  # Helm of Narv
    document = json.loads((ITEMS_DIR / "items.json").read_text(encoding="utf-8"))
    assert "hotfix" in document["source"]
    assert len(items) > 9000


def test_committed_rows_are_well_formed(items: dict[int, dict[str, Any]]) -> None:
    assert len(items) > 4000
    for item in items.values():
        assert item["slot"] in ITEM_SLOTS
        assert item["quality"] in ITEM_QUALITIES
        assert set(item["stats"]) <= set(STAT_KEYS)
        assert item["classes"] is None or set(item["classes"]) <= CLASS_IDS
        assert not item["name"].startswith(("Monster - ", "Deprecated "))


@pytest.mark.parametrize(
    "name",
    [
        # Rows the Forever client carries that no player can get (seen in build 1.60.1).
        "Item Properties Test",
        "Nax PH Crit Plate Shoulders",
        "QATest +1000 Spell Dmg Ring",
        "UNUSED Electrified Mithril Gauntlets",
        "UNUSED - Cloak of Arcane Insulation",
        "2hander Animation as 1hander test copy",
        "[TMP] Furbolg Ritual Stave",
        "Monster - Axe, Horde",
    ],
)
def test_junk_names_are_left_out(name: str) -> None:
    assert JUNK_NAME.search(name)


@pytest.mark.parametrize(
    "name",
    ["Testament of Hope", "Robe of the Archmage", "Phalanx Leggings", "Contest Winner's Tabbard", "Ophidian Belt"],
)
def test_real_names_are_kept(name: str) -> None:
    assert not JUNK_NAME.search(name)


def test_random_suffix_items(items: dict[int, dict[str, Any]]) -> None:
    suffix = json.loads((ITEMS_DIR / "classic" / "randomSuffixItems.json").read_text(encoding="utf-8"))
    assert suffix["source"].startswith("cmangos/classic-db@")
    assert suffix["ids"] and set(suffix["ids"]) <= set(items)
    assert (ITEMS_DIR / "classic" / "LICENSE").exists()
