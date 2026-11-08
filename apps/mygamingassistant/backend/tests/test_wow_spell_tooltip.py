"""The spell tooltip evaluator's talent-shaped tokens: expressions, plurals,
proc options, radius and the conditional's "no" branch. Food tooltips are
covered in ``test_wow_food_generator.py``."""
from __future__ import annotations

import pytest

from scripts.wow_food.tooltip import (
    AuraOptions,
    Effect,
    SpellBook,
    evaluate,
    unresolved_tokens,
)


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


def test_low_and_high_letters_read_the_ends_of_a_roll() -> None:
    # Classic Berserking: "by $m1% to $M1%" — each letter is one end, not the whole range.
    book = _book("Increases attack speed by $m1% to $M1%.", _effect(0, 20, variance=1.0))
    assert evaluate(book, 1) == "Increases attack speed by 10% to 30%."


def test_an_until_cancelled_duration_stays_unresolved() -> None:
    book = _book("Lasts $d.", _effect(0, 0), durations_ms={1: -1})
    assert unresolved_tokens(evaluate(book, 1)) == ["$d"]


# --- codes the Forever spellbook needed; fixtures are the client's own rows ---

FROST_DAMAGE_VARIABLES = {
    "frostdamage1": "$?s11151[${1.02}][${1.0}]",
    "frostdamage2": "$?s12952[${1.04}][${$<frostdamage1>}]",
    "frostdamage": "$?s12953[${1.06}][${$<frostdamage2>}]",
}


def test_description_variables_resolve_through_their_chain() -> None:
    # Immolate (348): $<mult> walks five talent conditionals down to ${1.0}.
    variables = {
        "mult1": "$?s17815[${1.05}][${1.0}]",
        "mult2": "$?s17833[${1.10}][${$<mult1>}]",
        "mult3": "$?s17834[${1.15}][${$<mult2>}]",
        "mult4": "$?s17835[${1.20}][${$<mult3>}]",
        "mult": "$?s17836[${1.25}][${$<mult4>}]",
    }
    dot = Effect(index=0, effect=6, aura=3, base_points=3, misc=0, period_ms=3000, trigger=0)
    book = _book(
        "Burns the enemy for ${$m2*$<mult>} Fire damage and then an additional $o1 Fire damage over $d.",
        dot,
        _effect(1, 8),
        durations_ms={1: 15000},
        variables={1: variables},
    )
    assert evaluate(book, 1) == "Burns the enemy for 8 Fire damage and then an additional 15 Fire damage over 15 sec."


def test_a_variable_that_names_itself_stays_unresolved() -> None:
    book = _book("Deals ${$<loop>} damage.", _effect(0, 1), variables={1: {"loop": "${$<loop>+1}"}})
    assert unresolved_tokens(evaluate(book, 1)) == ["${$<loop>}"]


def test_a_variable_keeps_the_decimals_it_asks_for() -> None:
    book = _book("Absorbs $<pct>% of the damage.", _effect(0, 5), variables={1: {"pct": "${$m1/3}.1"}})
    assert evaluate(book, 1) == "Absorbs 1.7% of the damage."


def test_low_and_high_ends_of_a_roll_inside_expressions() -> None:
    # Frost Nova (122): base 20, variance 0.1 -> 19 to 21.
    book = _book(
        "Blasts enemies near the caster for ${$m1*$<frostdamage>} to ${$M1*$<frostdamage>} Frost damage.",
        _effect(0, 20, variance=0.1),
        variables={1: FROST_DAMAGE_VARIABLES},
    )
    assert evaluate(book, 1) == "Blasts enemies near the caster for 19 to 21 Frost damage."


def test_a_stray_times_sign_in_an_expression_is_read_as_multiply() -> None:
    # Frostbolt (116) writes ${$m2$*$<frostdamage>}: base 19, variance 0.105 -> 18 to 20.
    book = _book(
        "Causes ${$m2$*$<frostdamage>} to ${$M2*$<frostdamage>}  Frost damage and slows by $s1%.",
        _effect(0, -40),
        _effect(1, 19, variance=0.10526315868),
        variables={1: FROST_DAMAGE_VARIABLES},
    )
    assert evaluate(book, 1) == "Causes 18 to 20 Frost damage and slows by 40%."


def test_an_expression_without_decimals_rounds_to_a_whole_number() -> None:
    # Flametongue Totem (8227)'s shape, through another spell's roll:
    # 410 x 0.67 / 77 - 1 = 2.57 -> 3; 410 x 1.33 / 25 = 21.8 -> 22.
    book = SpellBook(
        descriptions={1: "Each hit causes ${$2m1/77*$<mult>-1} to ${$2M1/25*$<mult>} additional Fire damage."},
        effects={1: [_effect(0, 5)], 2: [_effect(0, 410, variance=0.66)]},
        variables={1: {"mult": "$?s29193[${1.12}][${1.0}]"}},
    )
    assert evaluate(book, 1) == "Each hit causes 3 to 22 additional Fire damage."


def test_gender_choice_reads_both() -> None:
    # Conjure Water (5504).
    book = _book("Conjures $s1 $lbottle:bottles; for the mage and $ghis:her; allies.", _effect(0, 2))
    assert evaluate(book, 1) == "Conjures 2 bottles for the mage and his or her allies."


def test_radius_with_no_effect_number_takes_the_first_effect_with_one() -> None:
    # Challenging Shout (1161): "within $a yards".
    book = _book("Forces all nearby enemies within $a yards to attack you.", _effect(0, 0, radius_yards=10.0))
    assert evaluate(book, 1) == "Forces all nearby enemies within 10 yards to attack you."


def test_points_per_combo_point() -> None:
    # Expose Armor (8647): EffectPointsPerResource -90.
    book = _book("1 point : ${$b*-1} Armor 5 points: ${$b*-5} Armor", _effect(0, 0, points_per_resource=-90.0))
    assert evaluate(book, 1) == "1 point : 90 Armor 5 points: 450 Armor"


def test_misc_value() -> None:
    # Resurrection (2006): EffectMiscValue_0 = the mana restored.
    book = SpellBook(
        descriptions={1: "Brings a dead player back to life with $s1 health and $q1 mana."},
        effects={1: [Effect(index=0, effect=329, aura=0, base_points=70, misc=135, period_ms=0, trigger=0)]},
    )
    assert evaluate(book, 1) == "Brings a dead player back to life with 70 health and 135 mana."


def test_most_targets_and_highest_target_level() -> None:
    # Psychic Scream (8122) and Mind Soothe (453).
    book = _book(
        "Causes $i enemies within $a1 yards to flee. Only affects targets level $v or lower.",
        _effect(0, 0, radius_yards=8.0),
        max_targets={1: 2},
        max_target_levels={1: 40},
    )
    assert evaluate(book, 1) == "Causes 2 enemies within 8 yards to flee. Only affects targets level 40 or lower."


def test_a_missing_target_cap_stays_unresolved() -> None:
    assert unresolved_tokens(evaluate(_book("Hits $i enemies.", _effect(0, 1)), 1)) == ["$i"]


def test_effect_amplitude() -> None:
    # Mana Shield (1463): "Drains $e mana per damage absorbed", EffectAmplitude 2.
    book = _book("Drains $e mana per damage absorbed.", _effect(0, 120, amplitude=2.0))
    assert evaluate(book, 1) == "Drains 2 mana per damage absorbed."


def test_chain_amplitude_scaled() -> None:
    # Execute (5308): $*10;F1 with EffectChainAmplitude 0.3 -> 3.
    book = _book(
        "Converts each extra point of rage into $*10;F1 additional damage.",
        _effect(0, 125, chain_amplitude=0.30000001192093),
    )
    assert evaluate(book, 1) == "Converts each extra point of rage into 3 additional damage."


def test_range_of_another_spell() -> None:
    # Searing Totem (3599) names its attack spell 3606's range and damage.
    book = SpellBook(
        descriptions={1: "Attacks an enemy within $2r yards for $2s1 Fire damage."},
        effects={1: [_effect(0, 5)], 2: [_effect(0, 10, variance=0.2)]},
        ranges_yards={2: 20.0},
    )
    assert evaluate(book, 1) == "Attacks an enemy within 20 yards for 9 to 11 Fire damage."


def test_period_with_no_effect_number_takes_the_periodic_effect() -> None:
    # Wrack (1316697): "every $t sec" -> the first effect with a period.
    periodic = Effect(index=0, effect=6, aura=3, base_points=36, misc=0, period_ms=1000, trigger=0)
    book = _book("Inflicts $s1 Shadow damage every $t sec for $d.", periodic, durations_ms={1: 6000})
    assert evaluate(book, 1) == "Inflicts 36 Shadow damage every 1 sec for 6 sec."


def test_chain_targets_inside_an_expression() -> None:
    # Hammer of the Righteous (407632): ${$x1-1} with EffectChainTargets 4.
    book = _book("Hammer the target and up to ${$x1-1} additional nearby targets.", _effect(0, 1, chain_targets=4))
    assert evaluate(book, 1) == "Hammer the target and up to 3 additional nearby targets."


def test_a_conditional_on_a_known_spell_takes_the_no_branch() -> None:
    # Tranquility (740): $?$p456322[...][...].
    periodic = Effect(index=0, effect=35, aura=8, base_points=87, misc=0, period_ms=2000, trigger=0)
    book = _book("Heals for $?$p456322[${$m1*2}][$s1] every $t1 sec.", periodic)
    assert evaluate(book, 1, conditional_else=True) == "Heals for 87 every 2 sec."


def test_a_conditional_on_several_spells_takes_the_no_branch() -> None:
    # Feral Charge's form check joins its terms with "|".
    book = _book("$?a5487|a9634[Requires Bear Form. ][]Charge an enemy.", _effect(0, 0))
    assert evaluate(book, 1, conditional_else=True) == "Charge an enemy."


def test_another_spells_tooltip_reads_as_its_description() -> None:
    book = SpellBook(
        descriptions={1: "$@spelltooltip2", 2: "Heals $s1."},
        effects={1: [_effect(0, 1)], 2: [_effect(0, 50)]},
    )
    assert evaluate(book, 1) == "Heals 50."


def test_a_duration_until_cancelled_or_missing_stays_unresolved() -> None:
    periodic = Effect(index=0, effect=6, aura=3, base_points=10, misc=0, period_ms=3000, trigger=0)
    book = _book("Deals $o1 damage over $d.", periodic, durations_ms={1: -1})
    assert unresolved_tokens(evaluate(book, 1)) == ["$o1", "$d"]
    assert unresolved_tokens(evaluate(_book("Deals $o1 damage.", periodic), 1)) == ["$o1"]


def test_a_player_stat_stays_unresolved() -> None:
    # Life Tap (1454) scales with the player's Spirit; there's no static number.
    book = _book("Converts ${($m1+$SPI*1)} Health into Mana.", _effect(0, 20))
    assert unresolved_tokens(evaluate(book, 1)) == ["${(20+$SPI*1)}"]


def test_a_referenced_spell_never_borrows_the_outer_spells_numbers() -> None:
    # What spell 2 can't fill stays unfilled; the outer spell's $s1 and $d mustn't stand in.
    book = SpellBook(
        descriptions={1: "$@spelldesc2 Lasts $d.", 2: "Heals $s1 over $d."},
        effects={1: [_effect(0, 999)], 2: []},
        durations_ms={1: 30000},
    )
    assert evaluate(book, 1) == "Heals $s1 over $d. Lasts 30 sec."


@pytest.mark.parametrize("token", ["$e1", "$b1", "$f1", "$q1", "$A1", "$X1"])
def test_an_effect_field_of_zero_means_the_spell_has_none(token: str) -> None:
    assert unresolved_tokens(evaluate(_book(f"Value {token}.", _effect(0, 7)), 1)) == [token]


def test_scaled_tokens_only_take_letters_the_evaluator_knows() -> None:
    book = _book("$/10;z1 and $*2;g1", _effect(0, 50))
    assert unresolved_tokens(evaluate(book, 1)) == ["$/10", "$*2"]


def test_a_negative_roll_reads_without_signs() -> None:
    # A debuff that rolls: base -30, variance 0.2 -> 27 to 33.
    assert evaluate(_book("Reduces armor by $s1.", _effect(0, -30, variance=0.2)), 1) == "Reduces armor by 27 to 33."
