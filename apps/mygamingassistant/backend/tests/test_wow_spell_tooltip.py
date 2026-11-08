"""The spell tooltip evaluator's talent-shaped tokens: expressions, plurals,
proc options, radius and the conditional's "no" branch. Food tooltips are
covered in ``test_wow_food_generator.py``."""
from __future__ import annotations

import pytest

from scripts.wow_food.tooltip import AuraOptions, Effect, SpellBook, evaluate, unresolved_tokens


def _effect(index: int, base: float, **kwargs: float) -> Effect:
    return Effect(index=index, effect=6, aura=0, base_points=base, misc=0, period_ms=0, trigger=0, **kwargs)


def _book(description: str, *effects: Effect, **extra: object) -> SpellBook:
    book = SpellBook(descriptions={1: description}, effects={1: list(effects)})
    for key, value in extra.items():
        setattr(book, key, value)
    return book


@pytest.mark.parametrize(("template", "base", "expected"), [
    ("Increases damage by $s1%.", 5, "Increases damage by 5%."),
    ("Reduces the cost by $S1%.", -10, "Reduces the cost by 10%."),
    ("Increases damage by $m1%.", 3, "Increases damage by 3%."),
])
def test_values_read_the_effect_without_a_sign(template: str, base: float, expected: str) -> None:
    assert evaluate(_book(template, _effect(0, base)), 1) == expected


@pytest.mark.parametrize(("template", "base", "expected"), [
    # A token keeps its sign inside an expression: -200 / -1000 = 0.2.
    ("Reduces the cast time by ${$m1/-1000}.1 sec.", -200, "Reduces the cast time by 0.2 sec."),
    ("Reduces the cast time by ${$m1/-1000}.2 sec.", -500, "Reduces the cast time by 0.5 sec."),
    ("Adds ${$s1*2} damage.", 15, "Adds 30 damage."),
    ("Adds ${($s1+5)/2} rage.", 15, "Adds 10 rage."),
])
def test_expressions_are_worked_out(template: str, base: float, expected: str) -> None:
    assert evaluate(_book(template, _effect(0, base)), 1) == expected


def test_an_expression_over_a_duration_reads_seconds() -> None:
    book = _book("Lasts ${$d/2} sec.", _effect(0, 1), durations_ms={1: 12000})
    assert evaluate(book, 1) == "Lasts 6 sec."


def test_an_expression_it_cannot_work_out_is_left_as_written() -> None:
    text = evaluate(_book("Scales by ${$SPFR*0.5} each.", _effect(0, 1)), 1)
    assert text == "Scales by ${$SPFR*0.5} each."
    assert unresolved_tokens(text) == ["${$SPFR*0.5}"]


def test_divided_values() -> None:
    assert evaluate(_book("Every $/1000;s1 sec.", _effect(0, 3000)), 1) == "Every 3 sec."


@pytest.mark.parametrize(("base", "expected"), [
    (1, "Generates 1 additional combo point."),
    (2, "Generates 2 additional combo points."),
])
def test_plurals_follow_the_number_before_them(base: float, expected: str) -> None:
    template = "Generates $s1 additional combo $lpoint:points;."
    assert evaluate(_book(template, _effect(0, base)), 1) == expected


def test_proc_chance_charges_and_stacks() -> None:
    book = _book(
        "A $h% chance to gain $n charges, stacking up to $u times.",
        _effect(0, 1),
        aura_options={1: AuraOptions(proc_chance=20, proc_charges=3, stacks=5)},
    )
    assert evaluate(book, 1) == "A 20% chance to gain 3 charges, stacking up to 5 times."


def test_proc_tokens_of_another_spell() -> None:
    book = _book("A $2h% chance.", _effect(0, 1), aura_options={2: AuraOptions(proc_chance=10)})
    assert evaluate(book, 1) == "A 10% chance."


def test_a_missing_proc_option_stays_unresolved() -> None:
    text = evaluate(_book("A $h% chance.", _effect(0, 1)), 1)
    assert unresolved_tokens(text) == ["$h%"]


def test_radius_and_chain_targets() -> None:
    book = _book("Hits $x1 targets within $a1 yards.", _effect(0, 1, radius_yards=8.0, chain_targets=3))
    assert evaluate(book, 1) == "Hits 3 targets within 8 yards."


def test_period_and_total_over_time() -> None:
    effect = Effect(index=0, effect=6, aura=3, base_points=10, misc=0, period_ms=3000, trigger=0)
    book = _book("Deals $o1 damage over $d, every $t1 sec.", effect, durations_ms={1: 12000})
    assert evaluate(book, 1) == "Deals 40 damage over 12 sec, every 3 sec."


def test_conditionals_are_dropped_by_default_and_take_the_no_branch_when_asked() -> None:
    template = "Increases damage by $s1%.$?s436895[ Also heals you.][ Lasts longer.]"
    book = _book(template, _effect(0, 4))
    assert evaluate(book, 1) == "Increases damage by 4%."
    assert evaluate(book, 1, conditional_else=True) == "Increases damage by 4%. Lasts longer."


def test_a_conditional_inside_a_referenced_description_follows_the_choice() -> None:
    book = SpellBook(
        descriptions={1: "$@spelldesc2", 2: "Base.$?a9[ Yes.][ No.]"},
        effects={1: [_effect(0, 1)], 2: [_effect(0, 1)]},
    )
    assert evaluate(book, 1, conditional_else=True) == "Base. No."


def test_unresolved_tokens_lists_nothing_for_plain_text() -> None:
    assert unresolved_tokens("Increases damage by 5%.") == []
    assert unresolved_tokens("Reduces cooldown by $proccooldown sec.") == ["$proccooldown"]
