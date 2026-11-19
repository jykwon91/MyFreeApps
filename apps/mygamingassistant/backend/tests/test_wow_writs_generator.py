"""The Crafting writs build: SavedVariables reading, product matching, tiers and turn-in spots."""
from __future__ import annotations

import json

import pytest

from scripts.wow_writs.build import writs_json
from scripts.wow_writs.saved_variables import SavedVariablesError, read_saved_variables
from scripts.wow_writs.writs import (
    merge_turn_ins,
    product_for,
    product_index,
    recorded_turn_ins,
    writ_items,
    writ_quest,
    writ_tier,
)

SAVED = r'''
MGADungeonQuestsSettings = {
	["turnInPins"] = false,
	["writSpots"] = {
		[94219] = {
			{
				["zone"] = "Durotar",
				["map"] = 1411,
				["x"] = 52.13,
				["y"] = 43.06,
				["seen"] = "2026-11-19",
				["faction"] = "Horde",
			}, -- [1]
		},
		[94004] = {
			{ ["zone"] = "", ["map"] = 1, ["x"] = 1, ["y"] = 1, ["seen"] = "2026-11-19", ["faction"] = "Horde" },
		},
	},
	["note"] = "say \"hi\"\n\065",
}
MGADungeonQuestsCharacter = nil
'''


def _item(tier: str | None, quest: int | None = 94219) -> dict:
    preview: dict = {}
    if tier is not None:
        preview["name_description"] = {"display_string": tier}
    if quest is not None:
        preview["item_starts_quest"] = {"quest": {"id": quest}}
    return {"id": 264019, "preview_item": preview}


def test_reads_the_tables_the_client_writes():
    saved = read_saved_variables(SAVED)
    settings = saved["MGADungeonQuestsSettings"]
    assert settings["turnInPins"] is False
    assert settings["note"] == 'say "hi"\nA'
    assert settings["writSpots"][94219][0]["map"] == 1411
    assert settings["writSpots"][94219][0]["x"] == pytest.approx(52.13)
    assert saved["MGADungeonQuestsCharacter"] is None


@pytest.mark.parametrize("text", ["X = os.exit()", "X = { [1] = }", "= 1", 'X = "open'])
def test_anything_but_data_is_refused(text):
    with pytest.raises(SavedVariablesError):
        read_saved_variables(text)


def test_recorded_spots_keep_only_complete_ones():
    spots = recorded_turn_ins(read_saved_variables(SAVED))
    assert spots == {94219: [{"zone": "Durotar", "map": 1411, "x": 52.1, "y": 43.1, "seen": "2026-11-19", "faction": "horde"}]}
    assert recorded_turn_ins({}) == {}
    assert recorded_turn_ins({"MGADungeonQuestsSettings": {"writSpots": "x"}}) == {}


def test_merge_keeps_every_place_once_with_the_latest_sighting():
    old = {1: [{"zone": "Durotar", "map": 1411, "x": 52.0, "y": 43.0, "seen": "2026-11-01", "faction": "horde"}]}
    new = {
        1: [
            {"zone": "Durotar", "map": 1411, "x": 52.4, "y": 43.2, "seen": "2026-11-19", "faction": "horde"},
            {"zone": "Elwynn Forest", "map": 1429, "x": 40.0, "y": 60.0, "seen": "2026-11-19", "faction": "alliance"},
        ],
        2: [{"zone": "Durotar", "map": 1411, "x": 10.0, "y": 10.0, "seen": "2026-11-19", "faction": "horde"}],
    }
    merged = merge_turn_ins(old, new)
    assert [s["zone"] for s in merged[1]] == ["Elwynn Forest", "Durotar"]
    assert merged[1][1]["seen"] == "2026-11-19"
    assert merged[2][0]["x"] == 10.0
    # A run with nothing new keeps what was there.
    assert merge_turn_ins(old) == old


def test_products_match_by_craft_recipe_or_teaching_item_name():
    crafting = [
        {"recipes": [
            {"name": "Elixir of Ogre Strength", "creates": {"id": 3391, "name": "Elixir of Ogre Strength"},
             "learn": {"item": "Recipe: Elixir of Ogre's Strength"}},
            {"name": "Golden Scale Gauntlets", "creates": {"id": 9366, "name": "Golden Scale Gauntlets"}},
            {"name": "Twin", "creates": {"id": 1, "name": "Twin"}},
            {"name": "Twin", "creates": {"id": 2, "name": "Twin"}},
            {"name": "Enchant Chest", "creates": None},
        ]},
    ]
    index = product_index(crafting)
    assert product_for("Elixir of Ogre's Strength", index) == {"id": 3391, "name": "Elixir of Ogre Strength"}
    assert product_for("golden scale gauntlets", index) == {"id": 9366, "name": "Golden Scale Gauntlets"}
    assert product_for("Twin", index) is None
    assert product_for("Potion of Demonslaying", index) is None


def test_writs_are_the_craftsmans_writ_items():
    names = {"10": "Craftsman's Writ: B", "5": "Craftsman's Writ: A", "7": "Craftsman's Writ", "8": "Linen Cloth"}
    assert writ_items(names) == [(5, "Craftsman's Writ: A"), (10, "Craftsman's Writ: B")]


def test_tier_and_quest_come_from_the_item_and_fail_loud_when_missing():
    assert writ_tier(_item("Expert")) == "expert"
    assert writ_quest(_item("Expert")) == 94219
    with pytest.raises(SystemExit):
        writ_tier(_item(None))
    with pytest.raises(SystemExit):
        writ_tier(_item("Master"))
    with pytest.raises(SystemExit):
        writ_quest(_item("Expert", quest=None))


def test_output_is_json_with_one_writ_per_line():
    writs = [{"id": 1, "name": "Craftsman's Writ: A", "tier": "expert", "questId": 9, "productName": "A", "product": None}]
    spots = {9: [{"zone": "Durotar", "map": 1411, "x": 1.0, "y": 2.0, "seen": "2026-11-19", "faction": "horde"}]}
    text = writs_json("1.60.1.70399", writs, spots)
    doc = json.loads(text)
    assert doc["writs"] == writs
    assert doc["turnIns"] == {"9": spots[9]}
    assert '\n{"id":1,' in text
