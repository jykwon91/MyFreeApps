"""Unit tests for app.services.wow.raid_limit_forms — reading Raid: Edit's limits forms.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import pytest

from app.services.wow.raid_limit_forms import (
    ClassForm,
    LineError,
    RoleForm,
    class_form_prefill,
    read_class_form,
    read_limit,
    read_role_form,
)


@pytest.mark.parametrize(
    ("text", "limit"),
    [("0", 0), ("4", 4), (" 40 ", 40), ("007", 7), ("41", None), ("-1", None), ("2.5", None), ("two", None), ("", None)],
)
def test_a_limit_is_a_whole_number_from_0_to_40(text: str, limit: int | None) -> None:
    assert read_limit(text) == limit


# ---------------------------------------------------------------------------
# Role limits: a box per role
# ---------------------------------------------------------------------------


def test_each_role_box_sets_clears_or_keeps_its_limit() -> None:
    old = {"melee": 5, "ranged": 6}
    fields = {"tank": "2", "melee": "", "ranged": "lots", "healer": " 4 "}
    # Empty clears melee; ranged can't be read, so it keeps its 6 and is reported.
    assert read_role_form(fields, old) == RoleForm({"tank": 2, "ranged": 6, "healer": 4}, ["ranged"])


def test_a_role_box_missing_from_the_submit_keeps_its_limit() -> None:
    assert read_role_form({"tank": "1"}, {"healer": 3}) == RoleForm({"tank": 1, "healer": 3}, [])
    assert read_role_form({"tank": "", "melee": "", "ranged": "", "healer": ""}, {"healer": 3}) == RoleForm({}, [])


def test_bad_boxes_are_reported_in_role_order() -> None:
    form = read_role_form({"tank": "99", "melee": "1", "ranged": "", "healer": "x"}, {})
    assert form == RoleForm({"melee": 1}, ["tank", "healer"])


# ---------------------------------------------------------------------------
# Class limits: a class per line
# ---------------------------------------------------------------------------


def test_a_class_is_named_any_way_the_post_shows_it() -> None:
    text = "Rogue: 3\nWARRIORS: 0\n<Mage>: <2>\nhun: 1\n  priest :  4  "
    form = read_class_form(text, {})
    assert form == ClassForm({"warrior": 0, "rogue": 3, "hunter": 1, "mage": 2, "priest": 4}, [])
    assert list(form.limits) == ["warrior", "rogue", "hunter", "mage", "priest"]  # the post's class order


def test_no_limit_clears_a_class_and_the_last_line_wins() -> None:
    assert read_class_form("Rogue: no limit\nMage: unlimited\nShaman:", {}) == ClassForm({}, [])
    assert read_class_form("Rogue: 2\nRogue: 4", {}) == ClassForm({"rogue": 4}, [])
    assert read_class_form("Rogue: 2\nRogue: no limit", {}) == ClassForm({}, [])


def test_when_every_line_reads_a_class_left_out_has_no_limit() -> None:
    assert read_class_form("Rogue: 3", {"priest": 5, "rogue": 1}) == ClassForm({"rogue": 3}, [])
    assert read_class_form("", {"priest": 5}) == ClassForm({}, [])  # an emptied box clears them all


def test_when_a_line_cant_be_read_classes_without_a_readable_line_keep_their_limit() -> None:
    form = read_class_form("Rogue: 2\nPreist: 3", {"priest": 5, "rogue": 1})
    assert form.limits == {"rogue": 2, "priest": 5}
    assert form.errors == [LineError("unknown", 2, "Preist", "priest")]


def test_each_kind_of_unreadable_line_and_where_it_is() -> None:
    text = "Rogue 3\n\nTanks: 2\nRouge: 3\nMage: lots\nWarlock: 41\nDancer: 2"
    assert read_class_form(text, {}).errors == [
        LineError("colon", 1, "Rogue 3"),
        LineError("tank", 3, "Tanks"),  # line numbers count the blank line
        LineError("unknown", 4, "Rouge", "rogue"),
        LineError("number", 5, "lots"),
        LineError("number", 6, "41"),
        LineError("unknown", 7, "Dancer", None),
    ]


def test_the_prefill_reads_back_as_the_same_limits() -> None:
    limits = {"warrior": 0, "rogue": 3, "shaman": 40}
    prefill = class_form_prefill(limits)
    assert prefill.split("\n")[:4] == ["Warrior: 0", "Druid: no limit", "Paladin: no limit", "Rogue: 3"]
    assert read_class_form(prefill, {"mage": 2}) == ClassForm(limits, [])
    assert read_class_form(class_form_prefill({}), {"mage": 2}) == ClassForm({}, [])
