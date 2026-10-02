"""Unit tests for app.services.discord.raid_limit_copy — what players and leaders read about limits.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import pytest

from app.services.discord import raid_limit_copy as copy
from app.services.discord.raid_draft_copy import NOTHING_CHANGED
from app.services.wow.raid_catalog import WowSpecInfo, spec_info
from app.services.wow.raid_limit_forms import LineError
from app.services.wow.raid_limits import LimitHit

_ROGUES = LimitHit("class", "rogue", 3, 3)
_NO_WARRIORS = LimitHit("class", "warrior", 0, 0)
_HEALERS = LimitHit("role", "healer", 4, 4)
_NO_TANKS = LimitHit("role", "tank", 0, 0)


def _spec(wow_class: str, spec: str) -> WowSpecInfo:
    info = spec_info(wow_class, spec)
    assert info is not None
    return info


# ---------------------------------------------------------------------------
# Refusals and marks
# ---------------------------------------------------------------------------


def test_a_refusal_ends_with_what_to_do_instead() -> None:
    assert copy.refusal_end(listed=True, spec_select=True) == copy.END_LISTED
    assert copy.refusal_end(listed=True, spec_select=False) == copy.END_LISTED
    assert copy.refusal_end(listed=False, spec_select=True) == copy.END_SPEC
    assert copy.refusal_end(listed=False, spec_select=False) == copy.END_CLASS


@pytest.mark.parametrize(
    ("hit", "text"),
    [
        (_ROGUES, "**Rogue** is full (3/3)."),
        (_NO_WARRIORS, "This raid isn't taking any **Warriors**."),
        (_HEALERS, "The raid already has all the **healers** it needs (4/4)."),
        (_NO_TANKS, "This raid isn't taking any **tanks**."),
        (LimitHit("role", "melee", 6, 6), "The raid already has all the **melee DPS** it needs (6/6)."),
    ],
)
def test_one_reason_names_the_limit(hit: LimitHit, text: str) -> None:
    assert copy.hit_text(hit) == text
    assert copy.refusal([hit], "rogue", copy.END_CLASS) == f"{text} {copy.END_CLASS}"


def test_several_reasons_say_the_whole_column_is_full() -> None:
    hits = [LimitHit("class", "druid", 1, 1), LimitHit("role", "tank", 2, 2)]
    assert copy.refusal(hits, "druid", copy.END_CLASS) == f"Every **Druid** spec is full right now. {copy.END_CLASS}"
    assert copy.refusal(hits, "tank", copy.END_LISTED) == f"Every **tank** spec is full right now. {copy.END_LISTED}"


def test_a_marked_spec_says_why_it_has_no_room() -> None:
    holy = _spec("priest", "holy")
    assert copy.spec_mark(holy, _HEALERS, "priest") == "Healer · full (4/4)"
    assert copy.spec_mark(_spec("warrior", "arms"), LimitHit("class", "warrior", 3, 3), "warrior") == (
        "Melee DPS · Warrior is full (3/3)"
    )
    assert copy.spec_mark(_spec("warrior", "fury"), _NO_WARRIORS, "warrior") == "Melee DPS · not open"
    # Under [Tank] every option is a tank: just the reason.
    assert copy.spec_mark(_spec("druid", "feral-tank"), LimitHit("role", "tank", 2, 2), "tank") == "full (2/2)"
    assert copy.spec_mark(_spec("druid", "feral-tank"), _NO_TANKS, "druid") == "Tank · not open"


def test_every_mark_fits_a_select_option() -> None:
    worst = LimitHit("class", "warlock", 40, 40)
    assert len(copy.spec_mark(_spec("warlock", "destruction"), worst, "warlock")) <= 100


# ---------------------------------------------------------------------------
# Raid: Edit's lines
# ---------------------------------------------------------------------------


def test_the_cards_limit_lines() -> None:
    assert copy.role_limits_line({}) == "**Role limits:** *none*"
    assert copy.role_limits_line({"healer": 4, "melee": 0}) == "**Role limits:** Melee 0 · Healers 4"
    assert copy.class_limits_line({}) == "**Class limits:** *none*"
    assert copy.class_limits_line({"shaman": 2, "warrior": 6}) == "**Class limits:** Warrior 6 · Shaman 2"


# ---------------------------------------------------------------------------
# What a save did
# ---------------------------------------------------------------------------


def test_the_role_form_says_what_it_did() -> None:
    assert copy.role_notice({}, {"tank": 2}, [], []) == copy.ROLE_OK
    assert copy.role_notice({"tank": 2}, {}, [], []) == copy.ROLE_CLEARED
    assert copy.role_notice({"tank": 2}, {"tank": 2}, [], []) == NOTHING_CHANGED
    assert copy.role_notice({}, {"tank": 2}, ["healer"], []) == (
        "Saved the rest. I couldn't read **Max healers**. Use a whole number from 0 to 40, or leave a box empty."
    )
    assert copy.role_notice({}, {}, ["tank", "melee", "healer"], []) == (
        "Nothing changed. I couldn't read **Max tanks**, **Max melee DPS** and **Max healers**. "
        "Use a whole number from 0 to 40, or leave a box empty."
    )


def test_a_limit_set_below_the_line_says_nobody_was_removed() -> None:
    over = [LimitHit("role", "tank", 3, 2)]
    assert copy.role_notice({}, {"tank": 2}, [], over) == (
        f"{copy.ROLE_OK}\nThe raid already has 3 tanks. Nobody was removed, "
        "but nobody else can join as a tank until there's room."
    )


@pytest.mark.parametrize(
    ("hits", "text"),
    [
        (
            [LimitHit("role", "melee", 1, 0), LimitHit("class", "rogue", 4, 3)],
            "The raid already has 1 melee DPS and 4 Rogues. "
            "Nobody was removed, but nobody else can join as melee DPS or a Rogue until there's room.",
        ),
        (
            [
                LimitHit("role", "tank", 3, 2),
                LimitHit("role", "healer", 1, 0),
                LimitHit("class", "rogue", 4, 3),
                LimitHit("class", "mage", 2, 1),
            ],
            "The raid already has 3 tanks, 1 healer, 4 Rogues and 1 more over their limits. "
            "Nobody was removed, but nobody else can join as any of them until there's room.",
        ),
    ],
)
def test_the_over_limit_note_names_up_to_three(hits: list[LimitHit], text: str) -> None:
    assert copy.over_limit_note(hits) == text


def test_the_class_form_lists_the_lines_it_couldnt_read() -> None:
    errors = [LineError("colon", 1, "Rogue 3"), LineError("tank", 2, "Tanks")]
    assert copy.class_notice({}, {"mage": 1}, errors, []) == "\n".join(
        [
            "Saved the rest. I couldn't read these lines:",
            '- Line 1: write it like "Rogue: 3".',
            "- Line 2: tank limits are under **Role limits** (Max tanks), not here.",
            copy.CLASS_BAD_TAIL,
        ]
    )
    many = [LineError("number", line, "x") for line in range(1, 6)]
    lines = copy.class_notice({}, {}, many, []).split("\n")
    assert lines[0] == "Nothing changed. I couldn't read these lines:"
    assert len([line for line in lines if line.startswith("- ")]) == 3
    assert lines[-2:] == ["…and 2 more.", copy.CLASS_BAD_TAIL]
    assert copy.class_notice({"mage": 1}, {}, [], []) == copy.CLASS_CLEARED
    assert copy.class_notice({}, {"mage": 1}, [], [LimitHit("class", "mage", 2, 1)]).split("\n") == [
        copy.CLASS_OK,
        "The raid already has 2 Mages. Nobody was removed, but nobody else can join as a Mage until there's room.",
    ]


def test_each_unreadable_line_says_how_to_fix_it() -> None:
    assert copy.line_error(LineError("number", 4, "lots")) == (
        'Line 4: "lots" isn\'t a number from 0 to 40. Use 0 for none, or "no limit".'
    )
    assert copy.line_error(LineError("unknown", 2, "Rouge", "rogue")) == (
        'Line 2: there\'s no class called "Rouge". Did you mean Rogue?'
    )
    assert copy.line_error(LineError("unknown", 3, "Dancer")) == 'Line 3: there\'s no class called "Dancer".'


def test_what_the_leader_typed_is_echoed_short_and_literal() -> None:
    echoed = copy.line_error(LineError("unknown", 1, "**Big**   _Rogue_ " + "x" * 30))
    assert echoed.startswith('Line 1: there\'s no class called "\\*\\*Big\\*\\* \\_Rogue\\_ xx')
    assert "…" in echoed
