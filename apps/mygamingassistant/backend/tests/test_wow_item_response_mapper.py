"""Direct tests of the Claude tool-input -> ItemExtractionResponse seam.

The API tests mock the Claude client, so they only prove wiring. These pin the
trust-boundary behaviour: unknown keys, junk numbers and malformed weapons are
dropped with a warning, and non-tooltips are rejected.
"""
from __future__ import annotations

import pytest

from app.services.wow.item_extraction_errors import NotAnItemTooltipError
from app.services.wow.item_response_mapper import map_tool_input


def _raw(**overrides: object) -> dict:
    raw: dict = {
        "is_item_tooltip": True,
        "name": "  Hand of Justice ",
        "quality": "rare",
        "slot": "trinket",
        "stats": {"attack_power": 20},
        "unparsed_effects": ["Chance on hit: grants an extra attack."],
    }
    raw.update(overrides)
    return raw


def test_maps_a_clean_item() -> None:
    result = map_tool_input(_raw(required_level=58, set_name="Nope"))
    assert result.item.name == "Hand of Justice"
    assert result.item.slot == "trinket"
    assert result.item.stats == {"attack_power": 20.0}
    assert result.item.unparsed_effects == ["Chance on hit: grants an extra attack."]
    assert result.item.required_level == 58
    assert result.warnings == []


def test_unknown_stat_keys_move_to_unparsed_with_warning() -> None:
    result = map_tool_input(_raw(stats={"stamina": 10, "mastery_rating": 12}))
    assert result.item.stats == {"stamina": 10.0}
    assert "mastery_rating: 12" in result.item.unparsed_effects
    assert any("mastery_rating" in w for w in result.warnings)


@pytest.mark.parametrize("bad", ["12", None, True, float("nan"), 1e9])
def test_junk_stat_values_are_dropped(bad: object) -> None:
    result = map_tool_input(_raw(stats={"stamina": bad, "agility": 5}))
    assert result.item.stats == {"agility": 5.0}
    assert result.warnings


def test_rated_stats_and_expertise_are_kept_distinct_from_percents() -> None:
    result = map_tool_input(_raw(stats={"hit_rating": 10, "hit_pct": 1, "expertise": 5}))
    assert result.item.stats == {"hit_rating": 10.0, "hit_pct": 1.0, "expertise": 5.0}


def test_weapon_dps_is_derived_when_missing() -> None:
    result = map_tool_input(
        _raw(slot="two_hand", weapon={"min_damage": 100, "max_damage": 160, "speed": 3.5})
    )
    assert result.item.weapon is not None
    assert result.item.weapon.dps == pytest.approx(37.1)


def test_invalid_weapon_is_dropped_with_warning() -> None:
    result = map_tool_input(_raw(weapon={"min_damage": 90, "max_damage": 10, "speed": 2.0}))
    assert result.item.weapon is None
    assert any("Weapon" in w for w in result.warnings)


def test_unknown_enums_become_null() -> None:
    result = map_tool_input(_raw(slot="face", quality="mythic"))
    assert result.item.slot is None
    assert result.item.quality is None


@pytest.mark.parametrize(
    "raw",
    [
        {"is_item_tooltip": False, "name": "Cat picture", "stats": {}},
        {"is_item_tooltip": "yes", "name": "Ring", "stats": {}},
        {"is_item_tooltip": True, "name": "   ", "stats": {"stamina": 5}},
    ],
)
def test_non_tooltips_are_rejected(raw: dict) -> None:
    with pytest.raises(NotAnItemTooltipError):
        map_tool_input(raw)


def test_item_with_nothing_readable_gets_a_warning() -> None:
    result = map_tool_input(_raw(stats={}, unparsed_effects=[]))
    assert any("No stats" in w for w in result.warnings)


_BRACERS_LINES = [
    "Buccaneer's Bracers of Magic",
    "Soulbound",
    "Wrist Cloth",
    "14 Armor",
    "Equip: Increases damage and healing done by magical spells and effects by up to 4.",
    "Durability 20 / 20",
    "Requires Level 14",
    "If you replace this item, the following stat changes will occur:",
    "+1 Armor",
    "+2 Intellect",
    "+2 Spirit",
    "-4 Spell Power",
]


def test_stats_are_kept_when_their_number_is_on_the_tooltip() -> None:
    result = map_tool_input(_raw(tooltip_lines=_BRACERS_LINES, stats={"spell_power": 4}))
    assert result.item.stats == {"spell_power": 4.0}
    assert result.warnings == []


def test_a_misread_number_is_dropped_not_scored() -> None:
    # The model's own transcription says "by up to 4" but its stats say 40.
    result = map_tool_input(_raw(tooltip_lines=_BRACERS_LINES, stats={"spell_power": 40}))
    assert result.item.stats == {}
    assert any("spell_power 40" in w for w in result.warnings)


def test_the_replace_this_item_comparison_is_not_this_items_stats() -> None:
    result = map_tool_input(
        _raw(tooltip_lines=_BRACERS_LINES, stats={"spell_power": 4, "intellect": 2, "spirit": 2})
    )
    assert result.item.stats == {"spell_power": 4.0}
    assert len(result.warnings) == 2


def test_without_transcribed_lines_stats_are_not_checked() -> None:
    assert map_tool_input(_raw(tooltip_lines=[])).item.stats == {"attack_power": 20.0}
