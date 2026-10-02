"""Unit tests for sign-up notes — a member's note for the raid leader.

Pure: no DB, no Discord.  What's kept of a typed note and how the leader
reads it (``raid_note``, ``raid_text.escape_note``), when a tap asks why,
the notes switch, My sign-up's note line, button and form, the [Add reason]
reply, and the notes on Raid: Signed and the leader's player card.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import NOTE_MAX, WowRaidSignup
from app.services.discord import raid_copy, raid_member_copy
from app.services.discord.raid_edit_views import notes_button
from app.services.discord.raid_leader_views import SHORT_NOTE_CHARS, signed_data
from app.services.discord.raid_manage_views import Target, player_data
from app.services.discord.raid_member_views import (
    my_signup_data,
    note_form,
    note_lines,
    reason_offer_data,
    reason_row,
    reason_text,
)
from app.services.discord.raid_views import EMBED_DESCRIPTION_LIMIT
from app.services.wow import raid_custom_id
from app.services.wow.raid_note import asks_reason, clean_note, shown_note
from app.services.wow.raid_signup_service import StatusChange
from app.services.wow.raid_text import escape_note

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ZWSP = chr(0x200B)  # zero-width space
_STATUSES = ("confirmed", "late", "tentative", "absence", "queued", "bench")


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 40,
        "status": "scheduled",
        "channel_id": "c1",
        "created_by_user_id": "u0",
        "created_by_display_name": "Thrall",
        "notes": None,
        "cancel_reason": None,
        "title": None,
        "signup_notes_enabled": True,
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _signup(
    name: str,
    *,
    note: str | None = None,
    status: str = "confirmed",
    wow_class: str | None = "mage",
    minute: int = 0,
) -> WowRaidSignup:
    spec_fields: dict[str, str | None] = {"wow_class": None, "role": None, "spec": None}
    if wow_class is not None:
        spec_fields = {"wow_class": wow_class, "role": "dps", "spec": "frost"}
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=str(200_000_000_000_000_000 + minute),
        display_name=name,
        character_name=None,
        status=status,
        note=note,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
        **spec_fields,
    )


def _change(status: str, previous: str | None, outcome: str = "changed") -> StatusChange:
    return StatusChange(outcome=outcome, status=status, queued=status == "queued", previous=previous)


def _ids(data: dict[str, Any]) -> list[str]:
    return [c["custom_id"] for row in data["components"] for c in row["components"]]


# ---------------------------------------------------------------------------
# What's kept, and how the leader reads it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("typed", "kept"),
    [
        ("Running late", "Running late"),
        ("  two\n lines\tand  tabs  ", "two lines and tabs"),
        (f"bell\x07 and{_ZWSP} zero-width", "bell and zero-width"),
        ("", None),
        ("  \n\t ", None),
        ("\x00\x07", None),
        ("x" * 150, "x" * NOTE_MAX),
        ("a" * 99 + " b", "a" * 99),  # the cut doesn't leave a trailing space
    ],
)
def test_clean_note_keeps_one_line_of_printable_text(typed: str, kept: str | None) -> None:
    assert clean_note(typed) == kept


@pytest.mark.parametrize(
    ("note", "shown"),
    [
        ("@everyone raid now", f"@{_ZWSP}everyone raid now"),
        ("ping <@123>", rf"ping <{_ZWSP}@{_ZWSP}123\>"),
        ("**bold** move", r"\*\*bold\*\* move"),
        ("see https://x.y", f"see https:{_ZWSP}//x.y"),
        ("two\nlines", "two lines"),
    ],
)
def test_escape_note_never_pings_links_or_formats(note: str, shown: str) -> None:
    assert escape_note(note) == shown


def test_escape_note_cuts_long_notes_with_an_ellipsis() -> None:
    cut = escape_note("word " * 20, max_chars=SHORT_NOTE_CHARS)
    assert (len(cut), cut[-1]) == (SHORT_NOTE_CHARS, "…")
    assert escape_note("x" * NOTE_MAX) == "x" * NOTE_MAX


def test_shown_note_hides_notes_while_they_are_off() -> None:
    signup = _signup("Alice", note="Running late")
    assert shown_note(_event(), signup) == "Running late"
    assert shown_note(_event(signup_notes_enabled=False), signup) is None
    assert shown_note(_event(), _signup("Bob")) is None


@pytest.mark.parametrize(
    ("notes_on", "change", "asks"),
    [
        (True, _change("late", "confirmed"), True),
        (True, _change("tentative", None), True),  # a first sign-up
        (True, _change("absence", "queued"), True),
        (False, _change("late", "confirmed"), False),
        (True, _change("queued", None), False),  # a full raid isn't the member's call
        (True, _change("late", "late", "unchanged"), False),
        (True, _change("late", "late"), False),  # only the spec changed
        (True, _change("bench", "confirmed"), False),
        (True, _change("confirmed", "late"), False),
    ],
)
def test_a_tap_asks_why_only_when_it_makes_the_member_late_tentative_or_absent(
    notes_on: bool, change: StatusChange, asks: bool
) -> None:
    assert asks_reason(notes_on, change) is asks


# ---------------------------------------------------------------------------
# Raid: Signed and the player card
# ---------------------------------------------------------------------------


def _signed(event: WowRaidEvent, signups: list[WowRaidSignup]) -> str:
    return signed_data(event, signups, emojis=EMPTY_EMOJIS)["embeds"][0]["description"]


def test_signed_lists_the_notes_in_sign_up_order_absences_included() -> None:
    signups = [
        _signup("Dan", note="Can tank if needed"),
        _signup("Alice", note="Running 10 minutes late", status="late", minute=1),
        _signup("Bob", minute=2),
        _signup("Cara", note="Out of town", status="absence", wow_class=None, minute=3),
    ]
    notes = '**Notes (3)**\nDan - "Can tank if needed"\nAlice - "Running 10 minutes late"\nCara - "Out of town"'
    assert _signed(_event(), signups).endswith(f"\n\n{notes}")
    assert "Notes" not in _signed(_event(signup_notes_enabled=False), signups)
    assert "Notes" not in _signed(_event(), [_signup("Bob")])


def test_signed_cuts_the_notes_to_fit_then_says_where_to_read_them() -> None:
    def crowd(count: int) -> list[WowRaidSignup]:
        return [_signup(f"P{n}", note="n" * NOTE_MAX, minute=n) for n in range(count)]

    assert f'P0 - "{"n" * NOTE_MAX}"' in _signed(_event(), crowd(5))
    cut = _signed(_event(), crowd(40))
    assert f'P39 - "{"n" * (SHORT_NOTE_CHARS - 1)}…"' in cut
    assert len(cut) <= EMBED_DESCRIPTION_LIMIT
    assert _signed(_event(), crowd(90)).endswith(f"**Notes (90)**\n{raid_member_copy.NOTES_DID_NOT_FIT}")


def test_signed_notes_never_ping_or_link() -> None:
    typed = "@everyone see <@123> at https://x.y **now**"
    description = _signed(_event(), [_signup("Alice", note=typed)])
    assert f'Alice - "{escape_note(typed)}"' in description
    assert "@everyone" not in description and "https://" not in description


def test_the_leaders_player_card_shows_the_note_while_notes_are_on() -> None:
    for signup in (_signup("Bob", note="Running late", status="late"), _signup("Cara", note="Away", status="absence")):
        target = Target(signup.discord_user_id, signup.display_name)
        for enabled, lines in ((True, [f'Note: "{signup.note}"']), (False, [])):
            card = player_data(_event(signup_notes_enabled=enabled), target, [signup], emojis=EMPTY_EMOJIS)
            shown = [line for line in card["embeds"][0]["description"].split("\n") if line.startswith("Note:")]
            assert shown == lines
    assert note_lines(_event(), _signup("Dan")) == []


# ---------------------------------------------------------------------------
# My sign-up, its form and the [Add reason] reply
# ---------------------------------------------------------------------------


def _card(event: WowRaidEvent, signup: WowRaidSignup) -> tuple[list[str], list[list[str]]]:
    """My sign-up's lines, and its buttons' labels row by row."""
    data = my_signup_data(event, signup, [signup], emojis=EMPTY_EMOJIS)
    return data["content"].split("\n"), [[c["label"] for c in row["components"]] for row in data["components"]]


def test_my_signup_shows_the_note_and_its_button_while_the_raid_takes_notes() -> None:
    char = raid_member_copy.CHARACTER_BUTTON
    lines, labels = _card(_event(), _signup("Alice"))
    assert (lines[-1], labels) == (raid_member_copy.NOTE_NOT_SET, [["Change spec", char, "Add note"], ["Full roster"]])

    lines, labels = _card(_event(), _signup("Alice", note="@here, running late"))
    assert (lines[-1], labels[0]) == (f'Note: "@{_ZWSP}here, running late"', ["Change spec", char, "Edit note"])

    lines, labels = _card(_event(signup_notes_enabled=False), _signup("Alice", note="Running late"))
    assert not [line for line in lines if line.startswith("Note")]
    assert labels[0] == ["Change spec", char]

    lines, labels = _card(_event(), _signup("Alice", note="Away", status="absence", wow_class=None))
    assert (lines[1:], labels[0]) == (["Status: **Absent**", 'Note: "Away"'], ["Edit note"])

    lines, labels = _card(_event(closed_at=_T0), _signup("Alice", status="bench"))
    assert (lines[-2:], labels[0]) == ([raid_member_copy.NOTE_NOT_SET, raid_copy.CLOSED], [char, "Add note"])


@pytest.mark.parametrize("status", _STATUSES)
def test_any_sign_up_may_take_a_note(status: str) -> None:
    lines, labels = _card(_event(), _signup("Alice", note="Hi", status=status))
    assert 'Note: "Hi"' in lines
    assert labels[0][-1] == "Edit note" and len(labels[0]) <= 3


def test_the_note_form_holds_the_note_and_fits_the_status() -> None:
    form = note_form(_event(), "note", _signup("Alice", note="Running late", status="late"))
    data = form["data"]
    assert (form["type"], data["custom_id"]) == (9, f"raid:v1:m:{_EVENT_ID}:note")
    assert data["title"] == "Note for the raid leader"
    [field] = data["components"]
    assert (field["label"], field["description"]) == (raid_member_copy.NOTE_LABEL, raid_member_copy.NOTE_HINT)
    box = field["component"]
    assert (box["value"], box["max_length"], box["required"]) == ("Running late", 100, False)
    assert "min_length" not in box
    assert box["placeholder"] == "e.g. Running 10 minutes late"

    form = note_form(_event(), "reason", _signup("Bob", status="absence"))
    assert form["data"]["custom_id"] == f"raid:v1:m:{_EVENT_ID}:reason"
    box = form["data"]["components"][0]["component"]
    assert ("value" in box, box["placeholder"]) == (False, "e.g. Out of town this weekend")


def test_the_note_form_example_fits_the_status() -> None:
    examples = {status: raid_member_copy.note_placeholder(status) for status in _STATUSES}
    assert examples["queued"] == examples["bench"] == "e.g. Free from 8pm if you need me"
    assert len(set(examples.values())) == 5


def test_the_reply_to_a_tap_asks_why_with_add_reason() -> None:
    asked = "You're marked **tentative**. Want to tell the raid leader why?"
    assert reason_text(raid_copy.LEFT_QUEUE, "tentative") == f"{raid_copy.LEFT_QUEUE}\n{asked}"
    assert reason_text(None, "late") == "You're marked **late**. Want to tell the raid leader why?"
    assert reason_text("", "absence") == "You're marked **absent**. Want to tell the raid leader why?"
    data = reason_offer_data(_EVENT_ID, asked)
    assert (data["content"], data["embeds"], data["components"]) == (asked, [], [reason_row(_EVENT_ID)])
    [button] = data["components"][0]["components"]
    assert (button["label"], button["custom_id"]) == ("Add reason", f"raid:v1:card:{_EVENT_ID}:reason")


# ---------------------------------------------------------------------------
# The notes switch, ids and copy
# ---------------------------------------------------------------------------


def test_the_notes_switch_shows_where_notes_stand() -> None:
    off = notes_button(_event(signup_notes_enabled=False))
    on = notes_button(_event())
    assert (off["label"], off["custom_id"]) == ("Notes: off", f"raid:v1:ed:{_EVENT_ID}:notes_on")
    assert (on["label"], on["custom_id"]) == ("Notes: on", f"raid:v1:ed:{_EVENT_ID}:notes_off")
    assert notes_button(_event(signup_notes_enabled=None))["label"] == "Notes: off"  # a draft not yet saved
    toggled = [raid_member_copy.notes_toggled(on, changed) for on in (True, False) for changed in (True, False)]
    assert toggled == [
        raid_member_copy.NOTES_ON,
        raid_member_copy.NOTES_ALREADY_ON,
        raid_member_copy.NOTES_OFF,
        raid_member_copy.NOTES_ALREADY_OFF,
    ]


def test_note_ids_fit_and_parse() -> None:
    event_id = uuid.uuid4()
    ids = [
        raid_custom_id.encode("card", event_id, "note"),
        raid_custom_id.encode("card", event_id, "reason"),
        raid_custom_id.encode("m", event_id, "note"),
        raid_custom_id.encode("m", event_id, "reason"),
        raid_custom_id.encode("ed", event_id, "notes_on"),
        raid_custom_id.encode("ed", event_id, "notes_off"),
    ]
    assert [len(custom_id) for custom_id in ids] == [54, 56, 51, 53, 56, 57]
    parsed = [raid_custom_id.parse(custom_id) for custom_id in ids]
    assert all(found is not None and found.event_id == event_id for found in parsed)


def test_note_copy_fits_discord() -> None:
    labels = [
        raid_member_copy.NOTE_ADD,
        raid_member_copy.NOTE_EDIT,
        raid_member_copy.REASON_BUTTON,
        raid_member_copy.NOTE_TITLE,
        raid_member_copy.NOTE_LABEL,
        raid_member_copy.notes_toggle_label(True),
        raid_member_copy.notes_toggle_label(False),
    ]
    assert max(len(label) for label in labels) <= 45
    hints = [raid_member_copy.NOTE_HINT, *(raid_member_copy.note_placeholder(status) for status in _STATUSES)]
    assert max(len(hint) for hint in hints) <= 100
