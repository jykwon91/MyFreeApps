"""Corrections mapper -- the trust boundary between the model's JSON and the
response we store and send. Never raises; bad items are dropped."""
from __future__ import annotations

from typing import Any

from app.services.tutor.corrections_mapper import (
    map_corrections_output,
    parse_model_json,
    scenario_state_for,
)


def _item(**overrides: Any) -> dict[str, Any]:
    item: dict[str, Any] = {
        "error_span": "un cafe grande",
        "corrected_span": "un café grande",
        "full_corrected_sentence": "Quiero un café grande.",
        "error_type": "lexical",
        "severity": "minor",
        "feedback_move": "recast",
        "explanation": "Just a small slip.",
    }
    item.update(overrides)
    return item


def _map(raw: object, *, max_corrections: int = 3, goal_count: int = 3, prior: tuple[int, ...] = ()):
    return map_corrections_output(
        raw, max_corrections=max_corrections, goal_count=goal_count, prior_goals_met=prior,
    )


def test_valid_output_maps_through() -> None:
    result = _map({"corrections": [_item()], "retry_prompt": "Try again!", "goals_met_this_turn": [1]})
    assert len(result.items) == 1
    assert result.items[0].corrected_span == "un café grande"
    assert result.retry_prompt == "Try again!"
    assert result.scenario_state.goals_met == [1]
    assert result.scenario_state.complete is False


def test_invalid_items_are_dropped() -> None:
    raw = {
        "corrections": [
            _item(error_type="spelling"),  # not in the vocabulary
            _item(severity="catastrophic"),
            _item(feedback_move="yell"),
            _item(error_span=""),
            _item(corrected_span="UN CAFE GRANDE"),  # no actual change
            _item(explanation=None),
            "not a dict",
            _item(),
        ],
        "retry_prompt": None,
        "goals_met_this_turn": [],
    }
    assert len(_map(raw).items) == 1


def test_dosage_keeps_the_most_severe() -> None:
    raw = {
        "corrections": [
            _item(severity="minor", error_span="a1"),
            _item(severity="blocks_meaning", error_span="b1"),
            _item(severity="noticeable", error_span="c1"),
        ],
        "retry_prompt": None,
        "goals_met_this_turn": [],
    }
    one = _map(raw, max_corrections=1)
    assert [i.error_span for i in one.items] == ["b1"]
    two = _map(raw, max_corrections=2)
    assert [i.error_span for i in two.items] == ["b1", "c1"]


def test_retry_prompt_needs_a_correction() -> None:
    result = _map({"corrections": [], "retry_prompt": "Try again", "goals_met_this_turn": []})
    assert result.retry_prompt is None


def test_goal_indexes_are_bounded_and_completion_is_server_side() -> None:
    raw = {"corrections": [], "retry_prompt": None, "goals_met_this_turn": [2, 7, -1, True, "1"]}
    result = _map(raw, goal_count=3, prior=(0, 1))
    assert result.scenario_state.goals_met == [0, 1, 2]
    assert result.scenario_state.complete is True


def test_free_talk_is_never_complete() -> None:
    assert scenario_state_for(set(), 0).complete is False
    assert scenario_state_for({0}, 0).goals_met == []


def test_strings_are_normalised_and_bounded() -> None:
    raw = {
        "corrections": [_item(explanation="  lots   of\n space " + "x" * 1000)],
        "retry_prompt": None,
        "goals_met_this_turn": [],
    }
    explanation = _map(raw).items[0].explanation
    assert explanation.startswith("lots of space x")
    assert len(explanation) <= 240


def test_garbage_never_raises() -> None:
    for raw in (None, [], "text", 42, {"corrections": "nope", "goals_met_this_turn": "x"}):
        result = _map(raw, prior=(0,))
        assert result.items == []
        assert result.scenario_state.goals_met == [0]


def test_parse_model_json() -> None:
    assert parse_model_json('{"a": 1}') == {"a": 1}
    assert parse_model_json("not json") == {}
