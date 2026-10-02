"""Manage sign-ups' status row — [Seat] [Late] [Tentative] [Bench] on a player's card — pure builders.

Which buttons a card greys out, the review a move gets when it gives up or
takes a seat (or a place in the queue), and what the leader and the player
are told.  Pure: no DB, no Discord.  The taps themselves are in
``test_discord_raid_manage_status_flow.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import EMPTY_EMOJIS, EmojiRef, EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy
from app.services.discord.components.raid_manage_status import needs_review
from app.services.discord.raid_manage_views import Target, mark_review_data, player_data
from app.services.wow.raid_custom_id import MARK_STATUSES, MAX_CUSTOM_ID_LEN, RaidCustomId, manage, parse
from app.services.wow.raid_limits import LimitHit

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ML = f"raid:v1:ml:{_EVENT_ID}"
_BOB_ID = "123456789012345678"
_BOB = Target(_BOB_ID, "Bob")
_SEAT_SWAPS = [raid_manage_copy.SEAT_SWAPS]


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


def _seats(count: int) -> list[WowRaidSignup]:
    """*count* Frost Mages with seats."""
    return [_signup(f"Mage{n}", wow_class="mage", spec="frost", minute=n) for n in range(count)]


def _status_row(data: dict[str, Any]) -> list[dict[str, Any]]:
    """The card's second row: [Seat] [Late] [Tentative] [Bench]."""
    return data["components"][1]["components"]


def _description(data: dict[str, Any]) -> list[str]:
    [embed] = data["embeds"]
    return embed["description"].split("\n")


def _buttons(data: dict[str, Any]) -> list[tuple[str, int, str]]:
    return [(c["label"], c["style"], c["custom_id"]) for row in data["components"] for c in row["components"]]


# ---------------------------------------------------------------------------
# Which moves ask first
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("previous", "requested", "asks"),
    [
        ("confirmed", "late", False),  # the seat stays
        ("late", "confirmed", False),
        ("tentative", "bench", False),  # no seat either way
        ("bench", "tentative", False),
        ("queued", "confirmed", False),  # already waiting for one
        ("confirmed", "tentative", True),  # a seat given up
        ("late", "bench", True),
        ("tentative", "confirmed", True),  # a seat (or a place in the queue) taken
        ("bench", "late", True),
        ("queued", "bench", True),  # a place in the queue given up
    ],
)
def test_a_move_asks_first_when_it_gives_up_or_takes_a_seat(previous: str, requested: str, asks: bool) -> None:
    assert needs_review(previous, requested) is asks


# ---------------------------------------------------------------------------
# The ids
# ---------------------------------------------------------------------------


def test_the_status_ids_round_trip_and_fit_at_their_longest() -> None:
    member = "9" * 20
    for verb in ("mark", "markt", "markq", "markr"):
        for status in MARK_STATUSES:
            assert parse(manage(_EVENT_ID, verb, member, status)) == RaidCustomId("ml", _EVENT_ID, (verb, member, status))
    assert len(manage(_EVENT_ID, "markt", member, "tentative")) == 84 <= MAX_CUSTOM_ID_LEN


@pytest.mark.parametrize(
    "tail",
    [
        "mark:-:confirmed",  # nobody named
        f"mark:{_BOB_ID}:queued",  # the queue is the bot's to give
        f"mark:{_BOB_ID}:absence",  # [Remove] is the leader's way off the raid
        f"mark:{_BOB_ID}:same",
        f"mark:{_BOB_ID}:-",
        f"markt:{_BOB_ID}:",
        f"markq:{_BOB_ID}:Bench",
    ],
)
def test_a_status_id_out_of_shape_is_turned_away(tail: str) -> None:
    assert parse(f"{_ML}:{tail}") is None


# ---------------------------------------------------------------------------
# The row on a player's card
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "size_cap", "greyed", "hints"),
    [
        ("confirmed", 40, {"confirmed"}, []),
        ("late", 2, {"late"}, []),
        ("tentative", 40, {"tentative"}, []),
        # On a full raid a seat is a seat holder's ([Seat] asks who goes to the bench), and late needs a seat.
        ("tentative", 2, {"tentative", "late"}, _SEAT_SWAPS),
        ("bench", 2, {"bench", "late"}, _SEAT_SWAPS),
        # Queued too (no button is where they are): [Seat] is that swap.
        ("queued", 2, {"late"}, _SEAT_SWAPS),
    ],
)
def test_the_row_greys_out_where_they_are_and_what_cant_be_had(
    status: str, size_cap: int, greyed: set[str], hints: list[str]
) -> None:
    data = player_data(_event(size_cap=size_cap), _BOB, [*_seats(2), _bob(status=status)], emojis=EMPTY_EMOJIS)
    row = _status_row(data)
    assert [b["label"] for b in row] == ["Seat", "Late", "Tentative", "Bench"]
    assert [b["custom_id"] for b in row] == [f"{_ML}:mark:{_BOB_ID}:{s}" for s in MARK_STATUSES]
    assert {s for s, b in zip(MARK_STATUSES, row) if b.get("disabled")} == greyed
    # Where they are now is the blue one.
    assert [s for s, b in zip(MARK_STATUSES, row) if b["style"] == 1] == [s for s in MARK_STATUSES if s == status]
    assert _description(data)[1:] == hints
    assert [b["label"] for b in data["components"][2]["components"]] == [raid_manage_copy.REMOVE, "Back"]


def test_the_row_carries_the_posts_status_icons_and_a_seat_none() -> None:
    names = ("status_late", "status_tentative", "status_bench")
    icons = EmojiSet({name: EmojiRef(str(1400000000000000000 + i), f"{name}__a1b2c3") for i, name in enumerate(names)})
    row = _status_row(player_data(_event(), _BOB, [_bob()], emojis=icons))
    assert [b.get("emoji") for b in row] == [
        None,
        {"id": "1400000000000000000", "name": "status_late__a1b2c3"},
        {"id": "1400000000000000001", "name": "status_tentative__a1b2c3"},
        {"id": "1400000000000000002", "name": "status_bench__a1b2c3"},
    ]
    # Without the icons the buttons are words alone.
    assert all("emoji" not in b for b in _status_row(player_data(_event(), _BOB, [_bob()], emojis=EMPTY_EMOJIS)))


def test_a_sign_up_with_no_class_has_nothing_to_seat_them_as() -> None:
    bob = _bob(status="tentative", wow_class=None, role=None, spec=None)
    data = player_data(_event(), _BOB, [bob], emojis=EMPTY_EMOJIS)
    assert len(data["components"]) == 2
    assert _description(data) == ["**Bob** is **tentative**."]


# ---------------------------------------------------------------------------
# The review
# ---------------------------------------------------------------------------


def test_benching_a_seat_holder_with_a_queue_says_the_seat_goes_on() -> None:
    signups = [*_seats(1), _bob(), _signup("Cy", status="queued", minute=40)]
    data = mark_review_data(_event(size_cap=2), _BOB, signups[1], "bench", "Fury Warrior", signups, reach="yes")
    assert _description(data) == [
        "Move **Bob** (**Fury Warrior**) to the **bench**?",
        "Their seat goes to the next player in the queue.",
    ]
    assert _buttons(data) == [
        ("Move and tell them", 1, f"{_ML}:markt:{_BOB_ID}:bench"),
        ("Move quietly", 2, f"{_ML}:markq:{_BOB_ID}:bench"),
        ("Move and say why", 2, f"{_ML}:markr:{_BOB_ID}:bench"),
        ("Back", 2, f"{_ML}:card:{_BOB_ID}:-"),
    ]
    assert data["embeds"][0]["author"] == {"name": "Bob"}


def test_a_queued_player_moved_off_the_line_loses_their_place_and_dms_off_says_so() -> None:
    signups = [*_seats(2), _bob(status="queued")]
    data = mark_review_data(_event(size_cap=2), _BOB, signups[-1], "tentative", "Fury Warrior", signups, reach="off")
    assert _description(data) == [
        "Mark **Bob** (**Fury Warrior**) as **tentative**?",
        "They lose their place in the queue.",
        raid_manage_copy.dm_off("**Bob**"),
    ]
    assert _buttons(data) == [("Move", 1, f"{_ML}:markq:{_BOB_ID}:tentative"), ("Back", 2, f"{_ML}:card:{_BOB_ID}:-")]


def test_a_move_onto_the_line_over_a_limit_warns_and_the_leaders_own_card_just_moves() -> None:
    signups = [_signup("Al"), _bob(status="tentative")]
    event = _event(class_limits={"warrior": 1})
    data = mark_review_data(event, _BOB, signups[-1], "late", "Fury Warrior", signups, reach="self")
    assert _description(data) == [
        "Give **Bob** a seat as **Fury Warrior** and mark them **late**?",
        raid_manage_copy.over_limit_ok(LimitHit("class", "warrior", 1, 1)),
    ]
    assert _buttons(data) == [("Move", 1, f"{_ML}:markq:{_BOB_ID}:late"), ("Back", 2, f"{_ML}:card:{_BOB_ID}:-")]
    # Off the line, a limit doesn't count.
    data = mark_review_data(event, _BOB, _bob(), "bench", "Fury Warrior", [_signup("Al"), _bob()], reach="self")
    assert _description(data) == ["Move **Bob** (**Fury Warrior**) to the **bench**?"]


# ---------------------------------------------------------------------------
# What the leader and the player are told
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "position", "notice"),
    [
        ("confirmed", None, "**Bob** has a seat."),
        ("late", None, "**Bob** has a seat and is marked **late**."),
        ("tentative", None, "**Bob** is **tentative**."),
        ("bench", None, "**Bob** is on the **bench**."),
        ("queued", 3, "The raid is full, so **Bob** is **#3 in the queue**."),
    ],
)
def test_the_notice_says_where_a_move_left_them(status: str, position: int | None, notice: str) -> None:
    assert raid_manage_copy.moved("**Bob**", status, position) == notice
    assert raid_manage_copy.status_unchanged("**Bob**", status, position) == f"Nothing changed. {notice}"


def test_the_notice_names_who_moved_up_and_a_limit_gone_over() -> None:
    assert raid_manage_copy.moved_up(["**Cy**", "**Di**"]) == "**Cy** and **Di** moved up from the queue."
    assert raid_manage_copy.removed("**Bob**", ["**Cy**"]) == "Removed **Bob**. **Cy** moved up from the queue."
    assert raid_manage_copy.moved_over(LimitHit("class", "warrior", 1, 1)).endswith(
        " Leaders can go over limits, so I moved them anyway."
    )


_DM_RAID = "**Onyxia's Lair** (<t:100:F>"


@pytest.mark.parametrize(
    ("status", "position", "signups_open", "text"),
    [
        (
            "confirmed",
            None,
            True,
            f"<@42> gave you a seat on {_DM_RAID}, <t:100:R>) as **Fury Warrior**. "
            "Can't make it? Tap **Absence** on the raid post.",
        ),
        (
            "late",
            None,
            False,
            f"<@42> gave you a seat on {_DM_RAID}, <t:100:R>) as **Fury Warrior** and marked you **late**. "
            "Can't make it? Let <@42> know.",
        ),
        (
            "queued",
            3,
            True,
            f"<@42> put you in the queue for {_DM_RAID}, <t:100:R>) as **Fury Warrior**. "
            "The raid is full, so you're **#3 in the queue**. I'll move you up automatically when a seat opens.",
        ),
        ("tentative", None, True, f"<@42> marked you **tentative** for {_DM_RAID}). Questions? Ask them directly."),
        ("bench", None, False, f"<@42> moved you to the **bench** for {_DM_RAID}). Questions? Ask them directly."),
    ],
)
def test_the_moved_dm_says_what_the_leader_did(
    status: str, position: int | None, signups_open: bool, text: str
) -> None:
    link = "https://discord.com/channels/1/2/3"
    dm = raid_manage_copy.moved_dm(
        "42", "Onyxia's Lair", 100, "Fury Warrior", status, position, link, signups_open=signups_open
    )
    assert dm == f"{text}\n[Jump to the raid]({link})"
    no_post = raid_manage_copy.moved_dm(
        "42", "Onyxia's Lair", 100, "Fury Warrior", status, position, None, signups_open=signups_open
    )
    assert no_post == text
