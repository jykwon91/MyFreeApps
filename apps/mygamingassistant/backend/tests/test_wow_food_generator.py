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
