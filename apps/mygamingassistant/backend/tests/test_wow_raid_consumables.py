"""WoW Forever raid consumables — dataset integrity and selector tests.

These tests exercise:

1. JSON schema integrity — every item_id resolves, names non-empty, 21546 absent.
2. ``select_consumables`` for multiple class/role/raid combinations.
3. Deduplication rule — highest tier + most specific source wins.
4. ``classic_advice`` flag for unannounced-raid keys.
5. ``UnknownRaidError`` on bad raid key.

No DB, no network, no server required.  The tests read
``backend/data/wow/raid_consumables.json`` directly, so they will fail if the
generator has not been run first (``python -m scripts.wow_consumables.build``).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pytest

from app.services.wow.raid_consumables import (
    ConsumableChecklist,
    UnknownRaidError,
    select_consumables,
    wowhead_url,
)

# Resolve the JSON relative to this file: tests/ -> backend/ -> data/wow/
_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "wow" / "raid_consumables.json"
_UNANNOUNCED_RAIDS = {"mc", "bwl", "zg", "aq20", "aq40", "naxx"}
_FOREVER_RAIDS = {"barrow_deeps", "hyjal_summit"}
# Onyxia is announced-likely but classic mechanics → classic_advice
_CLASSIC_ADVICE_RAIDS = _UNANNOUNCED_RAIDS | {"onyxia"}

BLOCKED_ID = 21546


@pytest.fixture(scope="module")
def data() -> dict:
    assert _DATA_PATH.exists(), (
        f"Dataset not found at {_DATA_PATH}. "
        "Run: python -m scripts.wow_consumables.build"
    )
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


def _all_items_in_data(data: dict) -> list[dict]:
    """Flatten every item entry from every section in the dataset."""
    items = []
    for section_key in ("raid_specific", "role_baseline", "class_extras", "food"):
        section = data[section_key]
        for group in section.values():
            items.extend(group)
    items.extend(data["always"])
    return items


# ---------------------------------------------------------------------------
# 1. Dataset integrity
# ---------------------------------------------------------------------------

class TestDatasetIntegrity:
    def test_file_present(self, data: dict) -> None:
        assert data  # non-empty

    def test_required_top_level_keys(self, data: dict) -> None:
        for key in ("generated_at", "client_build", "attribution", "raids",
                    "raid_specific", "role_baseline", "class_extras", "food", "always"):
            assert key in data, f"Missing key: {key!r}"

    def test_client_build_is_forever(self, data: dict) -> None:
        assert data["client_build"] == "1.60.1.69977"

    def test_all_item_ids_are_integers(self, data: dict) -> None:
        for item in _all_items_in_data(data):
            assert isinstance(item["item_id"], int), f"Non-int item_id: {item}"

    def test_all_names_non_empty(self, data: dict) -> None:
        for item in _all_items_in_data(data):
            name = item.get("name", "")
            assert name and name.strip(), (
                f"Empty name for item_id={item['item_id']!r}"
            )

    def test_blocked_id_absent(self, data: dict) -> None:
        all_ids = {item["item_id"] for item in _all_items_in_data(data)}
        assert BLOCKED_ID not in all_ids, (
            f"Blocked item_id {BLOCKED_ID} must not appear in the dataset"
        )

    def test_tiers_are_valid(self, data: dict) -> None:
        valid_tiers = {"essential", "recommended", "tryhard"}
        for item in _all_items_in_data(data):
            assert item["tier"] in valid_tiers, f"Invalid tier: {item}"

    def test_wowhead_urls_present(self, data: dict) -> None:
        for item in _all_items_in_data(data):
            url = item.get("wowhead_url", "")
            assert url.startswith("https://www.wowhead.com/classic/item="), (
                f"Bad wowhead_url for item {item['item_id']}: {url!r}"
            )

    def test_raids_keys_present(self, data: dict) -> None:
        expected = {"barrow_deeps", "hyjal_summit", "onyxia",
                    "mc", "bwl", "zg", "aq20", "aq40", "naxx"}
        assert set(data["raids"].keys()) == expected

    def test_raids_have_required_fields(self, data: dict) -> None:
        for key, raid in data["raids"].items():
            for field in ("name", "size", "advice_source", "available"):
                assert field in raid, f"Raid {key!r} missing {field!r}"
            assert raid["advice_source"] in ("forever", "classic"), (
                f"Raid {key!r} has invalid advice_source: {raid['advice_source']!r}"
            )

    def test_natural_flasks_in_hyjal_and_barrow(self, data: dict) -> None:
        natural_ids = {274273, 274274, 274275, 274276}
        hyjal_ids = {i["item_id"] for i in data["raid_specific"]["hyjal_summit"]}
        barrow_ids = {i["item_id"] for i in data["raid_specific"]["barrow_deeps"]}
        assert natural_ids == hyjal_ids == barrow_ids

    def test_onyxia_scale_cloak_in_bwl_essential(self, data: dict) -> None:
        bwl = data["raid_specific"]["bwl"]
        cloak = next((i for i in bwl if i["item_id"] == 15138), None)
        assert cloak is not None, "Onyxia Scale Cloak missing from bwl"
        assert cloak["tier"] == "essential"


# ---------------------------------------------------------------------------
# 2. select_consumables — specific combos
# ---------------------------------------------------------------------------

class TestSelectConsumables:
    def test_priest_healer_onyxia(self) -> None:
        checklist = select_consumables("onyxia", "priest", "healer")
        assert isinstance(checklist, ConsumableChecklist)
        assert checklist.raid_key == "onyxia"
        assert checklist.raid_name == "Onyxia's Lair"
        # Onyxia: classic mechanics → classic_advice
        assert checklist.classic_advice is True
        # Major Mana Potion (13444) is essential for healers
        essential_ids = {i.item_id for i in checklist.essential}
        assert 13444 in essential_ids, "Priest healer should have Major Mana Potion (13444)"
        # Prayer of Fortitude reagent (17029) from class_extras.priest
        all_ids = {i.item_id for i in checklist.all_items()}
        assert 17029 in all_ids, "Priest should have Sacred Candle (17029) from class_extras"
        # Brilliant Mana Oil (20748) — healer role in class_extras.priest
        assert 20748 in all_ids, "Priest healer should have Brilliant Mana Oil (20748)"

    def test_warrior_tank_hyjal_summit(self) -> None:
        checklist = select_consumables("hyjal_summit", "warrior", "tank")
        assert checklist.classic_advice is False  # hyjal = forever
        # Natural flasks (tryhard) should all appear
        tryhard_ids = {i.item_id for i in checklist.tryhard}
        for flask_id in (274273, 274274, 274275, 274276):
            assert flask_id in tryhard_ids, f"Flask {flask_id} missing from hyjal warrior tank"
        # Warrior tank should have Mighty Rage Potion (13442) — classes: [warrior]
        assert 13442 in tryhard_ids, "Warrior should have Mighty Rage Potion (13442)"
        # Major Healing Potion (13446) essential for tank
        essential_ids = {i.item_id for i in checklist.essential}
        assert 13446 in essential_ids

    def test_rogue_dps_bwl_includes_onyxia_scale_cloak_essential(self) -> None:
        checklist = select_consumables("bwl", "rogue", "dps_physical")
        essential_ids = {i.item_id for i in checklist.essential}
        assert 15138 in essential_ids, (
            "Onyxia Scale Cloak (15138) must be essential for rogue dps in bwl"
        )

    def test_mage_dps_aq40_includes_elixir_of_frost_power(self) -> None:
        checklist = select_consumables("aq40", "mage", "dps_caster")
        all_ids = {i.item_id for i in checklist.all_items()}
        assert 17708 in all_ids, (
            "Elixir of Frost Power (17708) must appear for mage dps in aq40 (Viscidus)"
        )

    def test_class_none_works(self) -> None:
        checklist = select_consumables("barrow_deeps", None, "healer")
        # Should include role_baseline.healer + always + raid_specific.barrow_deeps
        assert len(checklist.all_items()) > 0
        # Major Mana Potion essential from healer baseline
        essential_ids = {i.item_id for i in checklist.essential}
        assert 13444 in essential_ids
        # Should NOT include food (class None)
        all_ids = {i.item_id for i in checklist.all_items()}
        # Healing food IDs (class_extras / food section) shouldn't appear
        food_only_id = 232438  # Smoked Redgill — healer food
        assert food_only_id not in all_ids, (
            "Food items must not appear when class is None"
        )

    def test_role_none_resolves_from_class(self) -> None:
        # Mage with no explicit role should default to dps_caster
        checklist_explicit = select_consumables("mc", "mage", "dps_caster")
        checklist_default = select_consumables("mc", "mage", None)
        explicit_ids = {i.item_id for i in checklist_explicit.all_items()}
        default_ids = {i.item_id for i in checklist_default.all_items()}
        assert explicit_ids == default_ids, "role=None should give same result as explicit dps_caster for mage"

    def test_priest_dps_gets_shadow_elixir_not_mana_oil(self) -> None:
        # Shadow priest: dps_caster + class_extras with roles=[dps]
        checklist = select_consumables("naxx", "priest", "dps_caster")
        all_ids = {i.item_id for i in checklist.all_items()}
        # Brilliant Wizard Oil (20749) — shadow spec class_extra, roles=[dps]
        assert 20749 in all_ids, "Shadow priest should have Brilliant Wizard Oil"
        # Elixir of Shadow Power (9264) — dps_caster baseline, classes=[warlock, priest]
        assert 9264 in all_ids, "Shadow priest should have Elixir of Shadow Power"

    def test_warrior_tank_does_not_get_warrior_class_extra_without_class(self) -> None:
        # When class is None, no class_extras (Dense Sharpening Stone 12404 is warrior extra)
        checklist = select_consumables("mc", None, "tank")
        all_ids = {i.item_id for i in checklist.all_items()}
        assert 12404 not in all_ids, "Dense Sharpening Stone should not appear with class=None"


# ---------------------------------------------------------------------------
# 3. Deduplication rule
# ---------------------------------------------------------------------------

class TestDeduplication:
    def test_major_healing_potion_appears_once_for_tank(self) -> None:
        """Item 13446 appears in always (essential) AND role_baseline.tank (essential)
        AND naxx raid_specific (essential).  Must appear exactly once in result."""
        checklist = select_consumables("naxx", "warrior", "tank")
        all_ids = [i.item_id for i in checklist.all_items()]
        assert all_ids.count(13446) == 1, (
            f"Major Healing Potion (13446) duplicated in naxx warrior tank result: {all_ids}"
        )

    def test_nature_prot_potion_tank_gets_essential_not_recommended(self) -> None:
        """Item 13458 in aq40 appears as essential for tank/healer and recommended
        for dps.  Tank should keep essential tier after dedup."""
        checklist = select_consumables("aq40", "warrior", "tank")
        essential_ids = {i.item_id for i in checklist.essential}
        recommended_ids = {i.item_id for i in checklist.recommended}
        assert 13458 in essential_ids, "Greater Nature Protection Potion should be essential for tank"
        assert 13458 not in recommended_ids, "Should not appear twice with different tiers"

    def test_elixir_of_frost_power_mage_aq40_appears_once(self) -> None:
        """Item 17708 appears in both dps_caster baseline (classes=[mage]) and
        aq40 raid_specific (classes=[mage]).  Should appear exactly once."""
        checklist = select_consumables("aq40", "mage", "dps_caster")
        all_ids = [i.item_id for i in checklist.all_items()]
        assert all_ids.count(17708) == 1, (
            f"Elixir of Frost Power (17708) duplicated for mage aq40: {all_ids}"
        )


# ---------------------------------------------------------------------------
# 4. classic_advice flag
# ---------------------------------------------------------------------------

class TestClassicAdvice:
    @pytest.mark.parametrize("raid_key", sorted(_CLASSIC_ADVICE_RAIDS))
    def test_unannounced_raids_have_classic_advice(self, raid_key: str) -> None:
        checklist = select_consumables(raid_key, None, None)
        assert checklist.classic_advice is True, (
            f"Raid {raid_key!r} should have classic_advice=True"
        )

    @pytest.mark.parametrize("raid_key", sorted(_FOREVER_RAIDS))
    def test_forever_raids_no_classic_advice(self, raid_key: str) -> None:
        checklist = select_consumables(raid_key, None, None)
        assert checklist.classic_advice is False, (
            f"Raid {raid_key!r} should have classic_advice=False"
        )


# ---------------------------------------------------------------------------
# 5. Error handling
# ---------------------------------------------------------------------------

class TestErrors:
    def test_unknown_raid_key_raises_typed_error(self) -> None:
        with pytest.raises(UnknownRaidError):
            select_consumables("gruuls_lair", "warrior", "tank")

    def test_error_message_includes_key(self) -> None:
        with pytest.raises(UnknownRaidError, match="gruuls_lair"):
            select_consumables("gruuls_lair", None, None)

    def test_error_message_includes_valid_keys(self) -> None:
        with pytest.raises(UnknownRaidError, match="barrow_deeps"):
            select_consumables("not_a_raid", None, None)


# ---------------------------------------------------------------------------
# 6. wowhead_url helper
# ---------------------------------------------------------------------------

def test_wowhead_url_format() -> None:
    assert wowhead_url(13446) == "https://www.wowhead.com/classic/item=13446"
    assert wowhead_url(274273) == "https://www.wowhead.com/classic/item=274273"
