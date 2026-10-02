"""Unit tests for app.services.discord.raid_manage_views — Manage sign-ups' cards — and their copy.

Pure: no DB, no Discord.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy
from app.services.discord.raid_copy import TANK_SPEC_NOTE
from app.services.discord.raid_limit_copy import spec_mark
from app.services.discord.raid_manage_views import (
    Target,
    hub_data,
    listed_signup,
    player_data,
    remove_data,
    review_data,
    spec_data,
)
from app.services.wow.raid_catalog import TANK_COLUMN, spec_info
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN
from app.services.wow.raid_limits import LimitHit

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_STAMP = int(_STARTS.timestamp())
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_RAID_LINE = f"**Onyxia's Lair** · <t:{_STAMP}:F>"
_ML = f"raid:v1:ml:{_EVENT_ID}"
_BOB_ID = "123456789012345678"
_AVATAR = "https://cdn.discordapp.com/embed/avatars/1.png"
_BOB = Target(_BOB_ID, "Bob", _AVATAR)
_FURY = spec_info("warrior", "fury")
_FULL_WARRIOR = LimitHit("class", "warrior", 1, 1)


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


def _signup(
    name: str,
    *,
    uid: str | None = None,
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "dps",
    spec: str | None = "fury",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=uid or str(200_000_000_000_000_000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _bob(**fields: Any) -> WowRaidSignup:
    return _signup("Bob", uid=_BOB_ID, minute=30, **fields)


def _buttons(data: dict[str, Any]) -> list[tuple[str, int, str]]:
    return [
        (c["label"], c["style"], c["custom_id"])
        for row in data["components"]
        for c in row["components"]
        if c["type"] == 2
    ]


def _select(data: dict[str, Any]) -> dict[str, Any]:
    return data["components"][0]["components"][0]


def _embed(data: dict[str, Any]) -> dict[str, Any]:
    [embed] = data["embeds"]
    return embed


# ---------------------------------------------------------------------------
# The hub
# ---------------------------------------------------------------------------


def test_the_hub_names_the_raid_and_its_seats_with_a_member_picker() -> None:
    signups = [
        _signup("Al", minute=1),
        _signup("Cy", status="late", minute=2),
        _signup("Di", status="queued", minute=3),
        _signup("Ed", status="tentative", minute=4),
    ]
    data = hub_data(_event(), signups)
    assert data["content"] == "\n".join(
        [_RAID_LINE, "**Seats:** 2/40 confirmed (1 late) · 1 in queue", raid_manage_copy.HUB_PROMPT]
    )
    assert data["flags"] == 64
    # A type-7 update off a player's card clears its embed.
    assert data["embeds"] == []
    assert data["allowed_mentions"] == {"parse": []}
    picker = _select(data)
    assert (picker["type"], picker["custom_id"], picker["placeholder"]) == (
        5,
        f"{_ML}:who:-:-",
        raid_manage_copy.PICK_PLAYER,
    )
    assert (picker["min_values"], picker["max_values"]) == (1, 1)
    assert _buttons(data) == [("Done", 1, f"{_ML}:done:-:-")]


def test_the_hub_says_what_the_last_tap_did_under_the_raid() -> None:
    data = hub_data(_event(size_cap=10), [], notice="Removed **Bob**.")
    assert data["content"].split("\n")[:3] == [_RAID_LINE, "Removed **Bob**.", "**Seats:** 0/10 confirmed"]


# ---------------------------------------------------------------------------
# A player's card
# ---------------------------------------------------------------------------


def test_a_player_on_the_raid_can_be_switched_or_removed() -> None:
    data = player_data(_event(), _BOB, [_signup("Al"), _bob()], emojis=EMPTY_EMOJIS)
    assert data["content"] == _RAID_LINE
    embed = _embed(data)
    assert embed == {
        "description": "**Bob** is in as **Fury Warrior**.",
        "color": COLOR_OPEN,
        "author": {"name": "Bob", "icon_url": _AVATAR},
    }
    select = _select(data)
    assert (select["custom_id"], select["placeholder"]) == (f"{_ML}:class:{_BOB_ID}:-", raid_manage_copy.CHANGE_CLASS)
    assert [option["value"] for option in select["options"]][:2] == [TANK_COLUMN, "warrior"]
    assert _buttons(data) == [("Remove", 4, f"{_ML}:ask:{_BOB_ID}:-"), ("Back", 2, f"{_ML}:open:-:-")]


@pytest.mark.parametrize(
    ("fields", "text"),
    [
        ({"status": "late"}, "**Bob** is in as **Fury Warrior** and marked **late**."),
        ({"status": "queued"}, "**Bob** is **#2 in the queue** as **Fury Warrior**."),
        ({"status": "bench"}, "**Bob** is on the **bench** as **Fury Warrior**."),
        ({"status": "tentative", "wow_class": None, "role": None, "spec": None}, "**Bob** is **tentative**."),
        # A sign-up from before specs.
        ({"role": "tank", "spec": None}, "**Bob** is in as **Warrior (Tank)**."),
    ],
)
def test_the_card_says_where_the_player_stands(fields: dict[str, Any], text: str) -> None:
    signups = [_signup("Al", status="queued", minute=1), _bob(**fields)]
    data = player_data(_event(), _BOB, signups, emojis=EMPTY_EMOJIS)
    assert _embed(data)["description"] == text
    assert _buttons(data)[0][0] == raid_manage_copy.REMOVE


@pytest.mark.parametrize(
    ("signups", "text"),
    [
        ([_signup("Al")], "**Bob** isn't on this raid yet. Pick the class they're bringing."),
        ([_bob(status="absence")], "**Bob** marked themselves **absent**. Pick a class to add them back."),
    ],
)
def test_a_player_off_the_raid_gets_a_class_to_add_them_as(signups: list[WowRaidSignup], text: str) -> None:
    data = player_data(_event(), _BOB, signups, emojis=EMPTY_EMOJIS)
    assert _embed(data)["description"] == text
    assert _select(data)["placeholder"] == raid_manage_copy.PICK_CLASS
    assert _buttons(data) == [("Back", 2, f"{_ML}:open:-:-")]


def test_a_card_with_no_name_mentions_the_player_and_has_no_author() -> None:
    data = player_data(_event(closed_at=_T0), Target(_BOB_ID), [], emojis=EMPTY_EMOJIS)
    assert _embed(data) == {
        "description": f"<@{_BOB_ID}> isn't on this raid yet. Pick the class they're bringing.",
        "color": COLOR_CLOSED,
    }
    # The mention renders their name; nobody is pinged.
    assert data["allowed_mentions"] == {"parse": []}


def test_the_name_is_escaped_in_text_and_plain_in_the_author_line() -> None:
    target = Target(_BOB_ID, "*Bob_", None)
    data = player_data(_event(), target, [], emojis=EMPTY_EMOJIS, notice="Switched.")
    assert data["content"] == f"{_RAID_LINE}\nSwitched."
    embed = _embed(data)
    assert embed["description"].startswith(r"**\*Bob\_** isn't on this raid")
    assert embed["author"] == {"name": "*Bob_"}


def test_listed_signup_skips_absence() -> None:
    assert listed_signup([_bob(status="absence")], _BOB_ID) is None
    bench = _bob(status="bench")
    assert listed_signup([_signup("Al"), bench], _BOB_ID) is bench


# ---------------------------------------------------------------------------
# The spec card
# ---------------------------------------------------------------------------


def test_the_spec_card_offers_the_column_and_preselects_the_players_spec() -> None:
    data = spec_data(_event(), _BOB, "warrior", [_bob()], emojis=EMPTY_EMOJIS)
    assert _embed(data)["description"] == "Which **Warrior** spec is **Bob** bringing?"
    select = _select(data)
    assert (select["custom_id"], select["placeholder"]) == (f"{_ML}:spec:{_BOB_ID}:warrior", raid_manage_copy.PICK_SPEC)
    defaults = [option["value"] for option in select["options"] if option.get("default")]
    assert defaults == ["warrior.fury"]
    assert _buttons(data) == [("Back", 2, f"{_ML}:card:{_BOB_ID}:-")]


@pytest.mark.parametrize(
    ("column", "signups"),
    [
        (TANK_COLUMN, [_bob()]),  # Fury isn't a tank
        ("warrior", [_bob(status="absence")]),  # absence isn't on the raid
        ("warrior", []),
    ],
)
def test_nothing_is_preselected_off_the_players_spec(column: str, signups: list[WowRaidSignup]) -> None:
    data = spec_data(_event(), _BOB, column, signups, emojis=EMPTY_EMOJIS)
    assert not any(option.get("default") for option in _select(data)["options"])


def test_the_tank_card_asks_which_tank() -> None:
    data = spec_data(_event(), _BOB, TANK_COLUMN, [], emojis=EMPTY_EMOJIS)
    assert _embed(data)["description"] == "Which tank is **Bob** bringing?"


def test_specs_over_a_limit_are_marked_and_still_offered() -> None:
    event = _event(class_limits={"warrior": 1})
    data = spec_data(event, _BOB, "warrior", [_signup("Al")], emojis=EMPTY_EMOJIS)
    assert _embed(data)["description"] == (
        f"Which **Warrior** spec is **Bob** bringing?\n{raid_manage_copy.SPEC_MARKS_NOTE}"
    )
    descriptions = {option["value"]: option.get("description") for option in _select(data)["options"]}
    assert descriptions == {
        "warrior.arms": spec_mark(spec_info("warrior", "arms"), _FULL_WARRIOR, "warrior"),
        "warrior.fury": spec_mark(_FURY, _FULL_WARRIOR, "warrior"),
        # A class limit never counts a tank.
        "warrior.protection": TANK_SPEC_NOTE,
    }


def test_a_player_already_in_a_full_class_may_switch_inside_it() -> None:
    event = _event(class_limits={"warrior": 1})
    data = spec_data(event, _BOB, "warrior", [_bob()], emojis=EMPTY_EMOJIS)
    assert raid_manage_copy.SPEC_MARKS_NOTE not in _embed(data)["description"]


# ---------------------------------------------------------------------------
# Adding: the review card
# ---------------------------------------------------------------------------


def test_the_review_offers_to_tell_the_player() -> None:
    data = review_data(_event(), _BOB, _FURY, [_signup("Al")], reach="yes")
    assert _embed(data)["description"] == "Add **Bob** to this raid as **Fury Warrior**?"
    assert _buttons(data) == [
        ("Add and tell them", 1, f"{_ML}:addt:{_BOB_ID}:warrior.fury"),
        ("Add quietly", 2, f"{_ML}:addq:{_BOB_ID}:warrior.fury"),
        ("Back", 2, f"{_ML}:card:{_BOB_ID}:-"),
    ]


@pytest.mark.parametrize(
    ("reach", "extra"),
    [
        ("self", []),
        ("off", ["**Bob** has DM reminders off, so I can't message them."]),
    ],
)
def test_the_review_just_adds_when_no_dm_can_go(reach: str, extra: list[str]) -> None:
    data = review_data(_event(), _BOB, _FURY, [], reach=reach)
    assert _embed(data)["description"].split("\n")[1:] == extra
    assert _buttons(data) == [
        ("Add", 1, f"{_ML}:addq:{_BOB_ID}:warrior.fury"),
        ("Back", 2, f"{_ML}:card:{_BOB_ID}:-"),
    ]


def test_the_review_warns_of_the_queue_and_a_limit_before_adding() -> None:
    event = _event(size_cap=2, class_limits={"warrior": 1})
    signups = [_signup("Al", minute=1), _signup("Cy", wow_class="mage", spec="frost", minute=2)]
    signups.append(_signup("Di", status="queued", wow_class="mage", spec="fire", minute=3))
    data = review_data(event, _BOB, _FURY, signups, reach="yes")
    assert _embed(data)["description"].split("\n") == [
        "Add **Bob** to this raid as **Fury Warrior**?",
        "The raid is full, so they'd be **#2 in the queue**.",
        "**Warrior** is full (1/1). Leaders can go over limits, so this still works.",
    ]


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------


def test_removing_a_seat_holder_says_the_queue_moves_up() -> None:
    signups = [_bob(), _signup("Al", status="queued", minute=1)]
    data = remove_data(_event(), _BOB, signups[0], signups, reach="yes")
    assert _embed(data)["description"] == (
        "Remove **Bob** (**Fury Warrior**) from this raid? Their seat goes to the next player in the queue."
    )
    assert _buttons(data) == [
        ("Remove and tell them", 4, f"{_ML}:dropt:{_BOB_ID}:-"),
        ("Remove quietly", 2, f"{_ML}:dropq:{_BOB_ID}:-"),
        ("Keep them", 2, f"{_ML}:card:{_BOB_ID}:-"),
    ]


@pytest.mark.parametrize(
    "signups",
    [
        [_bob()],  # nobody queued
        [_bob(status="tentative"), _signup("Al", status="queued", minute=1)],  # no seat to free
    ],
)
def test_removing_frees_no_seat_for_the_queue(signups: list[WowRaidSignup]) -> None:
    data = remove_data(_event(), _BOB, signups[0], signups, reach="yes")
    assert _embed(data)["description"] == "Remove **Bob** (**Fury Warrior**) from this raid?"


@pytest.mark.parametrize(
    ("reach", "text"),
    [
        ("self", "Remove **Bob** from this raid?"),
        ("off", "Remove **Bob** from this raid?\n**Bob** has DM reminders off, so I can't message them."),
    ],
)
def test_removing_without_a_dm(reach: str, text: str) -> None:
    bob = _bob(status="tentative", wow_class=None, role=None, spec=None)
    data = remove_data(_event(), _BOB, bob, [bob], reach=reach)
    assert _embed(data)["description"] == text
    assert _buttons(data) == [("Remove", 4, f"{_ML}:dropq:{_BOB_ID}:-"), ("Keep them", 2, f"{_ML}:card:{_BOB_ID}:-")]


# ---------------------------------------------------------------------------
# Copy
# ---------------------------------------------------------------------------


def test_removed_names_everyone_who_moved_up() -> None:
    assert raid_manage_copy.removed("**Bob**", []) == "Removed **Bob**."
    assert raid_manage_copy.removed("**Bob**", ["**Al**", "**Cy**", "**Di**"]) == (
        "Removed **Bob**. **Al**, **Cy** and **Di** moved up from the queue."
    )


def test_the_added_dm_gives_the_seat_or_the_queue_place_and_the_post() -> None:
    link = "https://discord.com/channels/1/2/3"
    assert raid_manage_copy.added_dm("42", "Onyxia's Lair", 100, "Fury Warrior", None, link) == (
        "<@42> added you to **Onyxia's Lair** (<t:100:F>, <t:100:R>) as **Fury Warrior**. "
        "You have a seat. Can't make it? Tap **Absence** on the raid post.\n"
        f"[Jump to the raid]({link})"
    )
    assert raid_manage_copy.added_dm("42", "Onyxia's Lair", 100, "Fury Warrior", 3, None) == (
        "<@42> added you to **Onyxia's Lair** (<t:100:F>, <t:100:R>) as **Fury Warrior**. "
        "The raid is full, so you're **#3 in the queue**. I'll move you up automatically when a seat opens."
    )
