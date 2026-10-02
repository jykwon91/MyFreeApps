"""Unit tests for app.services.discord.raid_edit_views — Raid: Edit's card, menus and forms.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy
from app.services.discord.raid_edit_views import (
    FIELD,
    WHEN_MAX,
    cancel_modal,
    color_picker,
    delete_check,
    description_modal,
    edit_card,
    image_modal,
    leader_picker,
    title_modal,
    when_modal,
    when_prefill,
)
from app.services.wow.raid_banners import banner_url
from app.services.wow.raid_details import DESCRIPTION_MAX, IMAGE_URL_MAX, REASON_MAX, TITLE_MAX
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN
from app.services.wow.raid_time_parser import parse_raid_time

# Sat Oct 10 2026, 20:00 America/New_York
_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_RAID_LINE = f"**Onyxia's Lair** · <t:{_STAMP}:F>"
_IMAGE = "https://i.imgur.com/raid.png"


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
    }
    fields.update(overrides)
    return WowRaidEvent(**fields)


def _id(action: str, *args: str) -> str:
    return ":".join(["raid:v1", action, str(_EVENT_ID), *args])


def _rows(data: dict[str, Any]) -> list[list[tuple[str, int, str]]]:
    """Each row's buttons as (label, style, custom_id)."""
    return [
        [(c["label"], c["style"], c["custom_id"]) for c in row["components"] if c["type"] == 2]
        for row in data["components"]
    ]


def _embed(data: dict[str, Any]) -> dict[str, Any]:
    [embed] = data["embeds"]
    return embed


def _input(modal: dict[str, Any]) -> dict[str, Any]:
    """A form's one text input, from inside its Label."""
    [label] = modal["data"]["components"]
    assert label["type"] == 18
    return label["component"]


_PROPERTY_ROWS = [
    [("Title", 2, _id("ed", "title")), ("Leader", 2, _id("ed", "leader")), ("Date & Time", 2, _id("ed", "when"))],
    [("Description", 2, _id("ed", "desc")), ("Image", 2, _id("ed", "image")), ("Color", 2, _id("ed", "color"))],
    [("Cancel raid", 4, _id("ed", "cancel")), ("Delete raid", 4, _id("ed", "delete")), ("Done", 1, _id("ed", "done"))],
]


# ---------------------------------------------------------------------------
# The edit card
# ---------------------------------------------------------------------------


def test_the_card_shows_the_raid_as_it_stands_with_a_button_for_each_thing() -> None:
    data = edit_card(_event())
    assert data["content"] == raid_copy.EDIT_PROMPT
    assert data["flags"] == 64 and data["allowed_mentions"] == {"parse": []}
    embed = _embed(data)
    assert embed["title"] == "Edit raid"
    assert embed["description"].split("\n") == [
        "**Title:** Onyxia's Lair",
        "**Leader:** Thrall",
        f"**Date & Time:** <t:{_STAMP}:F> (<t:{_STAMP}:R>)",
        "**Image:** The raid's own banner",
        "**Color:** \U0001F7E3 Purple",
        "**Description:** *none*",
    ]
    assert embed["color"] == COLOR_OPEN
    assert embed["footer"] == {"text": f"ID a1b2c3 · {raid_copy.EDIT_FOOTER}"}
    assert _rows(data) == _PROPERTY_ROWS


def test_the_card_shows_what_the_leader_changed() -> None:
    event = _event(
        title="Ony *speedrun*",
        leader_user_id="u9",
        leader_display_name="# Jaina",
        image_url=_IMAGE,
        color=0x3498DB,
        notes="Bring FR\nFlasks on pull",
    )
    embed = _embed(edit_card(event, notice=raid_copy.TITLE_OK))
    assert embed["description"].split("\n") == [
        r"**Title:** Ony \*speedrun\*",
        r"**Leader:** \# Jaina",
        f"**Date & Time:** <t:{_STAMP}:F> (<t:{_STAMP}:R>)",
        f"**Image:** [Your image]({_IMAGE})",
        "**Color:** \U0001F535 Blue",
        "**Description:**",
        "> Bring FR",
        "> Flasks on pull",
    ]
    assert embed["color"] == 0x3498DB
    assert embed["thumbnail"] == {"url": _IMAGE}
    assert edit_card(event, notice=raid_copy.TITLE_OK)["content"] == raid_copy.TITLE_OK


def test_the_card_falls_back_to_the_raids_banner_a_mention_and_a_hex_color(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", "https://mga.example")
    event = _event(created_by_display_name=None, color=0x123456)
    embed = _embed(edit_card(event))
    lines = embed["description"].split("\n")
    assert lines[1] == "**Leader:** <@u0>"
    assert lines[4] == "**Color:** #123456"
    assert embed["thumbnail"] == {"url": banner_url("onyxia")}


def test_closed_sign_ups_grey_the_card_but_leave_everything_editable() -> None:
    data = edit_card(_event(closed_at=_T0, color=0xE74C3C))
    assert _embed(data)["color"] == COLOR_CLOSED
    assert _rows(data) == _PROPERTY_ROWS


@pytest.mark.parametrize("status", ["cancelled", "completed"])
def test_a_raid_that_is_over_can_only_be_deleted(status: str) -> None:
    data = edit_card(_event(status=status))
    assert data["content"] == raid_copy.EDIT_GONE_PROMPT
    assert _rows(data) == [[("Delete raid", 4, _id("ed", "delete")), ("Done", 1, _id("ed", "done"))]]
    assert _embed(data)["title"] == "Edit raid"


def test_after_a_move_the_card_offers_to_tell_everyone_on_the_raid() -> None:
    moved = raid_copy.moved(_STAMP)
    data = edit_card(_event(), notice=moved, notify_count=3)
    assert data["content"] == f"{moved}\n{raid_copy.notify_offer(3)}"
    assert _rows(data) == [[(raid_copy.NOTIFY_BUTTON, 1, _id("lc", "notify"))], *_PROPERTY_ROWS]
    assert len(data["components"]) <= 5

    # --- nobody on the raid: nothing to offer
    data = edit_card(_event(), notice=moved, notify_count=0)
    assert data["content"] == moved
    assert _rows(data) == _PROPERTY_ROWS


def test_notify_offer_and_the_delete_prompt_count_people() -> None:
    assert raid_copy.notify_offer(1) == "1 person is signed up. Tell them about the new time?"
    assert raid_copy.notify_offer(4) == "4 people are signed up. Tell them about the new time?"
    assert raid_copy.delete_prompt("Ony", 0, can_cancel=False) == "Delete **Ony**? This removes the post. Nobody is notified."
    assert raid_copy.delete_prompt("Ony", 1, can_cancel=False) == (
        "Delete **Ony**? This removes the post and its 1 sign-up. Nobody is notified."
    )
    assert raid_copy.delete_prompt("Ony", 7, can_cancel=True) == (
        "Delete **Ony**? This removes the post and all 7 sign-ups. Nobody is notified. "
        "To tell people, use **Cancel raid** instead."
    )


# ---------------------------------------------------------------------------
# Leader and Color menus, the delete check
# ---------------------------------------------------------------------------


def test_the_leader_menu_offers_any_member_with_back() -> None:
    data = leader_picker(_event())
    assert data["content"].split("\n") == [_RAID_LINE, "**Leader:** Thrall", raid_copy.LEADER_PROMPT]
    assert data["embeds"] == []
    [menu] = data["components"][0]["components"]
    assert menu == {
        "type": 5,
        "custom_id": _id("pick", "leader"),
        "placeholder": "Pick the raid's leader",
        "min_values": 1,
        "max_values": 1,
    }
    assert _rows(data)[1] == [("Back", 2, _id("ed", "back"))]

    # --- a bot was picked: the menu again, saying why
    data = leader_picker(_event(), notice=raid_copy.LEADER_BOT)
    assert data["content"].split("\n")[-1] == raid_copy.LEADER_BOT


def test_the_color_menu_marks_the_raids_color() -> None:
    data = color_picker(_event())
    assert data["content"] == f"{_RAID_LINE}\n{raid_copy.COLOR_PROMPT}"
    assert data["embeds"] == []
    [menu] = data["components"][0]["components"]
    assert menu["type"] == 3 and menu["custom_id"] == _id("pick", "color")
    assert [(o["value"], o.get("default", False)) for o in menu["options"]] == [
        ("purple", True),
        ("blue", False),
        ("green", False),
        ("gold", False),
        ("orange", False),
        ("red", False),
    ]
    assert menu["options"][1] == {"label": "Blue", "value": "blue", "emoji": {"name": "\U0001F535"}}
    assert _rows(data)[1] == [("Back", 2, _id("ed", "back"))]

    marked = color_picker(_event(color=0xE67E22))["components"][0]["components"][0]["options"]
    assert [o["value"] for o in marked if o.get("default")] == ["orange"]
    off_list = color_picker(_event(color=0x123456))["components"][0]["components"][0]["options"]
    assert not any(o.get("default") for o in off_list)


def test_deleting_asks_first_and_points_at_cancel_while_it_can() -> None:
    data = delete_check(_event(), 2)
    assert data["content"] == raid_copy.delete_prompt("Onyxia's Lair", 2, can_cancel=True)
    assert data["embeds"] == []
    assert _rows(data) == [[("Delete raid", 4, _id("del")), ("Keep it", 2, _id("ed", "back"))]]

    over = delete_check(_event(status="cancelled", title="*Ony*"), 0)
    assert over["content"] == raid_copy.delete_prompt(r"\*Ony\*", 0, can_cancel=False)


# ---------------------------------------------------------------------------
# Forms
# ---------------------------------------------------------------------------


def test_the_title_form_holds_the_title_now() -> None:
    modal = title_modal(_event())
    assert modal["type"] == 9
    assert modal["data"]["custom_id"] == _id("m", "title")
    assert modal["data"]["title"] == raid_copy.TITLE_MODAL
    [label] = modal["data"]["components"]
    assert (label["label"], label["description"]) == (raid_copy.TITLE_LABEL, raid_copy.TITLE_HINT)
    assert _input(modal) == {
        "type": 4,
        "custom_id": FIELD,
        "style": 1,
        "max_length": TITLE_MAX,
        "required": True,
        "min_length": 1,
        "value": "Onyxia's Lair",
    }
    assert _input(title_modal(_event(title="Ony speedrun")))["value"] == "Ony speedrun"


def test_the_when_form_starts_from_the_raids_time_in_the_servers_timezone() -> None:
    modal = when_modal(_event(), "America/New_York")
    assert modal["data"]["custom_id"] == _id("m", "when")
    [label] = modal["data"]["components"]
    assert label["label"] == "When (America/New_York)"
    text_input = _input(modal)
    assert text_input["value"] == "10/10/2026 8:00pm"
    assert text_input["max_length"] == WHEN_MAX and text_input["required"] is True
    assert len(raid_copy.when_label("America/Argentina/ComodRivadavia")) <= 45  # Discord's label cap


def test_the_optional_forms_can_be_left_empty() -> None:
    description = _input(description_modal(_event(notes="Bring FR")))
    assert description == {
        "type": 4,
        "custom_id": FIELD,
        "style": 2,
        "max_length": DESCRIPTION_MAX,
        "required": False,
        "value": "Bring FR",
    }
    assert "value" not in _input(description_modal(_event()))
    image = _input(image_modal(_event(image_url=_IMAGE)))
    assert (image["style"], image["max_length"], image["required"], image["value"]) == (1, IMAGE_URL_MAX, False, _IMAGE)
    assert "value" not in _input(image_modal(_event()))
    reason = _input(cancel_modal(_event(cancel_reason="old")))
    assert (reason["max_length"], reason["required"]) == (REASON_MAX, False)
    assert "value" not in reason  # a fresh reason each time
    for modal, name in (
        (description_modal(_event()), "desc"),
        (image_modal(_event()), "image"),
        (cancel_modal(_event()), "cancel"),
    ):
        assert modal["data"]["custom_id"] == _id("m", name)


def test_a_prefilled_value_never_exceeds_the_inputs_limit() -> None:
    # Discord refuses a form whose value is longer than its max_length.
    assert len(_input(description_modal(_event(notes="x" * 900)))["value"]) == DESCRIPTION_MAX


@pytest.mark.parametrize(
    ("starts_at", "tz_name", "expected"),
    [
        (_STARTS, "America/New_York", "10/10/2026 8:00pm"),
        (datetime(2026, 10, 11, 4, 5, tzinfo=timezone.utc), "America/New_York", "10/11/2026 12:05am"),
        (datetime(2026, 10, 11, 16, 30, tzinfo=timezone.utc), "America/New_York", "10/11/2026 12:30pm"),
        (datetime(2026, 1, 2, 13, 45, tzinfo=timezone.utc), "America/New_York", "1/2/2026 8:45am"),
        (_STARTS, "Asia/Tokyo", "10/11/2026 9:00am"),
    ],
)
def test_when_prefill_reads_back_as_the_same_time(starts_at: datetime, tz_name: str, expected: str) -> None:
    assert when_prefill(starts_at, tz_name) == expected
    assert parse_raid_time(expected, tz_name=tz_name, now=starts_at - timedelta(days=1)) == starts_at
