"""WoW Forever food picker generator — tooltip evaluation, buff parsing, and
sanity checks on the committed data it produced.

Known values are from the Forever beta client (1.60.1.69977): Monster Omelet
is level 35, heals 1392 over 30 sec and gives 15 Stamina; Westfall Stew's
speed only works in Westfall; Prowler Steak gives two stats.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_food.foods import parse_buff
from scripts.wow_food.recipe_sources import MOB_COLUMNS, VENDOR_COLUMNS, LootIndex, _compact, _references
from scripts.wow_food.tooltip import Effect, SpellBook, evaluate, format_duration

FOOD_DATA = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "food"
)


def _effect(index: int, effect: int, bp: float = 0, *, aura: int = 0, period: int = 0, trigger: int = 0) -> Effect:
    return Effect(index=index, effect=effect, aura=aura, base_points=bp, misc=0, period_ms=period, trigger=trigger)


@pytest.fixture
def omelet_book() -> SpellBook:
    """Monster Omelet's use spell 1248394 → Food 1129 + Well Fed 1248406, as in the client."""
    return SpellBook(
        names={1129: "Food"},
        descriptions={
            1129: "Restores $o1 health over $d.  Must remain seated while eating.",
            1248394: (
                "$@spelldesc1129 If you spend at least 10 seconds eating you will become well fed "
                "and gain $s2 Stamina for $1248406d. $?a1243969[You also gain $1243969s1% more "
                "experience from kills.][]"
            ),
        },
        durations_ms={1129: 30000, 1248406: 900000},
        effects={
            1129: [_effect(0, 6, 232, aura=84)],
            1248394: [_effect(0, 64, trigger=1129), _effect(1, 6, 15, aura=227, period=10000, trigger=1248406)],
        },
    )


class TestEvaluate:
    def test_monster_omelet(self, omelet_book: SpellBook) -> None:
        assert evaluate(omelet_book, 1248394) == (
            "Restores 1392 health over 30 sec. Must remain seated while eating. If you spend at "
            "least 10 seconds eating you will become well fed and gain 15 Stamina for 15 min."
        )

    def test_period_and_numbered_duration(self) -> None:
        book = SpellBook(
            descriptions={2: "at least $1t2 sec eating, gain $s1 for $2d1."},
            durations_ms={2: 600000},
            effects={1: [_effect(0, 6), _effect(1, 6, period=10000)], 2: [_effect(0, 6, 22)]},
        )
        assert evaluate(book, 2) == "at least 10 sec eating, gain 22 for 10 min."

    def test_missing_effect_number_on_single_effect_spell(self) -> None:
        # Goldthorn Tea's tooltip reads $1249907s2 off a one-effect spell.
        book = SpellBook(descriptions={1: "gain $2s2 Herbalism skill"}, effects={2: [_effect(0, 6, 15)]})
        assert evaluate(book, 1) == "gain 15 Herbalism skill"

    def test_unknown_token_is_left_visible(self) -> None:
        book = SpellBook(descriptions={1: "gain $9s3 Stamina"}, effects={9: [_effect(0, 6), _effect(1, 6)]})
        assert evaluate(book, 1) == "gain $9s3 Stamina"

    @pytest.mark.parametrize(("ms", "text"), [(900000, "15 min"), (30000, "30 sec"), (3600000, "1 hr")])
    def test_format_duration(self, ms: int, text: str) -> None:
        assert format_duration(ms) == text


class TestParseBuff:
    def test_single_stat(self) -> None:
        buff = parse_buff("you will become well fed and gain 15 Stamina for 15 min.")
        assert buff == {
            "parts": [{"amount": 15, "percent": False, "label": "Stamina", "stats": ["stamina"]}],
            "duration": "15 min",
        }

    def test_zone_limited_speed(self) -> None:
        buff = parse_buff("gain 15% movement speed while in Westfall for 15 min.")
        assert buff == {
            "parts": [{"amount": 15, "percent": True, "label": "movement speed", "utility": "speed"}],
            "duration": "15 min",
            "zone": "Westfall",
        }

    def test_two_stats(self) -> None:
        buff = parse_buff("become Well Fed and gain 25 Strength and 10 Stamina for 15 min.")
        assert buff is not None
        assert [(p["amount"], p["label"]) for p in buff["parts"]] == [(25, "Strength"), (10, "Stamina")]

    def test_shared_amount(self) -> None:
        buff = parse_buff("gain 2 Stamina and Spirit for 15 min.")
        assert buff is not None
        assert [(p["amount"], p["label"]) for p in buff["parts"]] == [(2, "Stamina"), (2, "Spirit")]

    def test_list_with_oxford_and(self) -> None:
        buff = parse_buff("gain 25 Spell Damage, 55 Healing Power, and 10 Stamina for 15 min.")
        assert buff is not None
        assert [p["label"] for p in buff["parts"]] == ["Spell Damage", "Healing Power", "Stamina"]
        assert buff["parts"][1]["stats"] == ["healing"]

    def test_crit_percent(self) -> None:
        buff = parse_buff("gain 1% Critical Strike chance for 15 min.")
        assert buff is not None
        assert buff["parts"][0] == {
            "amount": 1, "percent": True, "label": "Critical Strike chance", "stats": ["crit_pct", "spell_crit_pct"],
        }

    def test_older_increase_wording(self) -> None:
        buff = parse_buff("If you eat for 10 seconds will also increase your Healing done by 22 for 10 min.")
        assert buff == {
            "parts": [{"amount": 22, "percent": False, "label": "Healing done", "stats": ["healing"]}],
            "duration": "10 min",
        }

    def test_fishing_is_utility_not_a_stat(self) -> None:
        buff = parse_buff("gain 12 Fishing Skill for 15 min.")
        assert buff is not None
        assert buff["parts"][0].get("utility") == "fishing"
        assert "stats" not in buff["parts"][0]

    def test_no_buff(self) -> None:
        assert parse_buff("Restores 61.2 health over 18 sec. Must remain seated while eating.") is None


@pytest.fixture(scope="module")
def foods() -> dict[str, dict]:
    data = json.loads((FOOD_DATA / "foods.json").read_text(encoding="utf-8"))
    return {f["name"]: f for f in data["foods"]}


class TestCommittedData:
    def test_monster_omelet(self, foods: dict[str, dict]) -> None:
        omelet = foods["Monster Omelet"]
        assert omelet["level"] == 35
        assert omelet["heal"] == {"amount": 1392, "seconds": 30}
        assert omelet["buff"]["parts"][0]["label"] == "Stamina"
        assert omelet["buff"]["parts"][0]["amount"] == 15
        assert omelet["xpBonusPct"] == 5
        assert omelet["kind"] == "food"

    def test_westfall_stew_is_zone_limited(self, foods: dict[str, dict]) -> None:
        assert foods["Westfall Stew"]["buff"]["zone"] == "Westfall"

    def test_every_eaten_item_has_a_known_kind(self, foods: dict[str, dict]) -> None:
        assert {f["kind"] for f in foods.values()} <= {"food", "drink", "feast", "other"}
        assert foods["Basic Campfire Kit"]["kind"] == "other"
        assert foods["Grand Lobster Banquet"]["kind"] == "feast"
        assert foods["Peace Tea"]["kind"] == "drink"

    def test_every_buff_part_is_scored_or_utility(self, foods: dict[str, dict]) -> None:
        for food in foods.values():
            for part in (food["buff"] or {}).get("parts", []):
                assert part.get("stats") or part.get("utility"), (food["name"], part["label"])

    def test_every_food_can_be_learned(self, foods: dict[str, dict]) -> None:
        for food in foods.values():
            learn = food["learn"]
            assert learn["source"] in {"recipe", "trainer"}
            if learn["source"] == "recipe":
                assert learn["recipe"].startswith("Recipe: "), food["name"]

    def test_trainer_skills_are_licensed_and_point_at_trainer_foods(self, foods: dict[str, dict]) -> None:
        classic = FOOD_DATA / "classic"
        assert (classic / "LICENSE").read_text(encoding="utf-8").startswith("                    GNU GENERAL PUBLIC LICENSE")
        skills = json.loads((classic / "trainerSkills.json").read_text(encoding="utf-8"))["skills"]
        by_id = {str(f["id"]): f for f in foods.values()}
        assert skills
        for item_id, skill in skills.items():
            assert by_id[item_id]["learn"]["source"] == "trainer"
            assert 1 <= skill <= 300

    def test_westfall_stew_recipe_ingredients_and_fire(self, foods: dict[str, dict]) -> None:
        stew = foods["Westfall Stew"]
        assert stew["learn"]["recipeItem"] == 728
        assert stew["learn"]["greenAt"] == 115
        assert [r["name"] for r in stew["reagents"]] == ["Stringy Vulture Meat", "Murloc Eye", "Goretusk Snout"]
        assert stew["focus"] == "Cooking Fire"

    def test_iron_oven_is_a_forever_requirement(self, foods: dict[str, dict]) -> None:
        assert foods["Bear Bruscitti"]["focus"] == "Iron Oven"


@pytest.fixture(scope="module")
def recipe_sources() -> dict:
    return json.loads((FOOD_DATA / "classic" / "recipeSources.json").read_text(encoding="utf-8"))


class TestRecipeSources:
    def test_columns_match_the_generator(self, recipe_sources: dict) -> None:
        assert recipe_sources["vendorColumns"] == VENDOR_COLUMNS
        assert recipe_sources["mobColumns"] == MOB_COLUMNS
        assert recipe_sources["source"].startswith("cmangos/classic-db@")

    def test_every_key_is_a_food_or_reagent(self, foods: dict[str, dict], recipe_sources: dict) -> None:
        by_id = {str(f["id"]): f for f in foods.values()}
        reagent_ids = {str(r["id"]) for f in foods.values() for r in f["reagents"]}
        for food_id in recipe_sources["recipes"]:
            assert by_id[food_id]["learn"]["source"] == "recipe"
        assert set(recipe_sources["reagents"]) <= reagent_ids

    def test_every_vendor_and_zone_is_placed(self, recipe_sources: dict) -> None:
        records = [*recipe_sources["recipes"].values(), *recipe_sources["reagents"].values()]
        for record in records:
            for vendor in record.get("vendors", []):
                row = dict(zip(VENDOR_COLUMNS, vendor))
                assert str(row["zone"]) in recipe_sources["zones"], row
                assert 0 <= row["x"] <= 100 and 0 <= row["y"] <= 100
                assert row["faction"] in {"A", "H", "N"}
            for quest in record.get("quests", []):
                assert str(quest) in recipe_sources["quests"]

    def test_westfall_stew_recipe_is_sold_in_stormwind(self, foods: dict[str, dict], recipe_sources: dict) -> None:
        sources = recipe_sources["recipes"][str(foods["Westfall Stew"]["id"])]
        names = [dict(zip(VENDOR_COLUMNS, v))["name"] for v in sources["vendors"]]
        assert "Kendor Kabonka" in names

    def test_a_goretusk_drops_goretusk_snout(self, recipe_sources: dict) -> None:
        drop = recipe_sources["reagents"]["731"]["drop"]
        assert not drop["world"]
        assert any("Goretusk" in mob[0] for mob in drop["mobs"])

    def test_each_farmable_mob_has_a_spot_on_the_map(self, recipe_sources: dict) -> None:
        goretusk = next(m for m in recipe_sources["reagents"]["731"]["drop"]["mobs"] if m[0] == "Goretusk")
        _, _, _, _, zone, subzone, x, y, kind = goretusk
        assert recipe_sources["zones"][str(zone)] == "Westfall"
        assert subzone == "Moonbrook" and kind == ""
        assert 0 <= x <= 100 and 0 <= y <= 100

    def test_giant_clams_say_where_they_lie(self, recipe_sources: dict) -> None:
        """"Found in Giant Clam" alone sends nobody anywhere: each container on the ground has a placed spot."""
        name, count, zone, subzone, x, y = recipe_sources["reagents"]["4655"]["objectSpots"][0]
        assert (name, recipe_sources["zones"][str(zone)], subzone) == ("Giant Clam", "Stranglethorn Vale", "The Vile Reef")
        assert count > 1 and 0 <= x <= 100 and 0 <= y <= 100
        for record in recipe_sources["reagents"].values():
            for spot in record.get("objectSpots", []):
                assert spot[0] in record["containers"] and str(spot[2]) in recipe_sources["zones"]

    def test_a_clam_item_says_which_mobs_drop_it(self, recipe_sources: dict) -> None:
        drops = dict(recipe_sources["reagents"]["5503"]["containerDrops"])
        assert drops["Small Barnacled Clam"]["mobs"]

    def test_savory_deviate_delight_is_a_rare_drop(self, foods: dict[str, dict], recipe_sources: dict) -> None:
        drop = recipe_sources["recipes"][str(foods["Savory Deviate Delight"]["id"])]["drop"]
        assert max(mob[3] for mob in drop["mobs"]) < 1


class TestLootIndex:
    def test_follows_reference_tables(self) -> None:
        refs = _references([
            {"entry": 900, "item": 5, "mincountOrRef": 1, "ChanceOrQuestChance": 2.5},
        ])
        index = LootIndex.build([
            {"entry": 1, "item": 7, "mincountOrRef": 1, "ChanceOrQuestChance": -40},
            {"entry": 1, "item": 900, "mincountOrRef": -900, "ChanceOrQuestChance": 100},
        ], refs)
        assert index.by_table[7] == [(1, 40.0, False)]
        assert index.by_table[5] == [(1, 2.5, True)]

    def test_compact_drops_empty_sources(self) -> None:
        assert _compact({"vendors": [], "drop": None, "quests": [3]}) == {"quests": [3]}
