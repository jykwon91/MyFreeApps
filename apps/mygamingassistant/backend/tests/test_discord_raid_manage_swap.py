"""Manage sign-ups: a seat on a full raid, which a seat holder gives up — pure builders.

The holder menu, its pages and [Queue them instead] (and that review); the
swap review, its buttons per whom a DM reaches and its limit counted with
the holder out of the line; the ids; the copy.  Pure: no DB, no Discord.
The taps are in ``test_discord_raid_manage_swap_flow.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_manage_copy
from app.services.discord.interaction import UNKNOWN_PLAYER
from app.services.discord.raid_manage_swap_views import back_to_holders, holders_data, swap_limit, swap_review_data
from app.services.discord.raid_manage_views import Reach, Target, mark_review_data
from app.services.wow.raid_custom_id import MAX_CUSTOM_ID_LEN, RaidCustomId, manage, parse
from app.services.wow.raid_limits import LimitHit

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ML = f"raid:v1:ml:{_EVENT_ID}"
_BOB_ID = "123456789012345678"
_BOB = Target(_BOB_ID, "Bob")
_MAGE1_ID = "200000000000000001"
_SWAPS = {"swapt": ("Swap and tell them", 1), "swapq": ("Swap quietly", 2), "swapr": ("Swap and say why", 2)}


def _event(**overrides: object) -> WowRaidEvent:
    fields: dict[str, object] = {
        "id": _EVENT_ID,
        "guild_id": uuid.uuid4(),
        "raid_key": "onyxia",
        "starts_at": _STARTS,
        "size_cap": 2,
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
    name: str, *, uid: str | None = None, status: str = "confirmed", minute: int = 0, **kind: Any
) -> WowRaidSignup:
    fields = {"wow_class": "warrior", "role": "dps", "spec": "fury", **kind}
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=uid or str(200_000_000_000_000_000 + minute),
        display_name=name,
        status=status,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
        **fields,
    )


def _bob(status: str = "bench") -> WowRaidSignup:
    return _signup("Bob", uid=_BOB_ID, status=status, minute=30)


def _seats(count: int) -> list[WowRaidSignup]:
    """*count* Frost Mages with seats (Mage1's id is ``_MAGE1_ID``)."""
    return [_signup(f"Mage{n}", minute=n, wow_class="mage", spec="frost") for n in range(count)]


def _description(data: dict[str, Any]) -> list[str]:
    [embed] = data["embeds"]
    return embed["description"].split("\n")


def _select(data: dict[str, Any]) -> dict[str, Any]:
    return data["components"][0]["components"][0]


def _buttons(data: dict[str, Any]) -> list[tuple[str, int, str]]:
    """The card's last row: its buttons."""
    return [(c["label"], c["style"], c["custom_id"]) for c in data["components"][-1]["components"]]


def _review(signups: list[WowRaidSignup], holder: WowRaidSignup, **event: Any) -> dict[str, Any]:
    """The review seating Bob (the last of *signups*) for *holder*, as **Fury Warrior**; a DM reaches both."""
    return swap_review_data(
        _event(**event), _BOB, signups[-1], "Fury Warrior", holder, signups, reach="yes", holder_reach="yes"
    )


# ---------------------------------------------------------------------------
# The holder menu
# ---------------------------------------------------------------------------


def test_the_menu_offers_the_seat_holders_in_line_order_as_the_post_numbers_them() -> None:
    signups = [
        *_seats(2),
        _signup("Al", status="late", minute=5, wow_class="mage", spec="fire"),
        _signup("Cy", status="queued", minute=40),
        _signup("Di", status="tentative", minute=41),
        _bob(),
    ]
    data = holders_data(_event(size_cap=3), _BOB, signups[-1], "Fury Warrior", signups)
    assert _description(data) == [
        "The raid is full. Pick who goes to the **bench** to make room for **Bob** (**Fury Warrior**).",
        "Or raise the size with `/raid-admin edit` to add a seat.",
    ]
    select = _select(data)
    assert (select["custom_id"], select["placeholder"]) == (f"{_ML}:swap:{_BOB_ID}:-", "Pick who goes to the bench")
    assert [(o["label"], o["description"], o["value"]) for o in select["options"]] == [
        ("1. Mage0", "Frost Mage", signups[0].discord_user_id),
        ("2. Mage1", "Frost Mage", _MAGE1_ID),
        ("3. Al", "Fire Mage · late", signups[2].discord_user_id),
    ]
    assert _buttons(data) == [
        ("Queue them instead", 2, f"{_ML}:queue:{_BOB_ID}:-"),
        ("Back", 2, f"{_ML}:card:{_BOB_ID}:-"),
    ]
    assert data["embeds"][0]["author"] == {"name": "Bob"}


def test_a_queued_player_gets_no_queue_them_instead() -> None:
    signups = [*_seats(2), _bob(status="queued")]
    data = holders_data(_event(), _BOB, signups[-1], "Fury Warrior", signups, notice="A notice.")
    assert _buttons(data) == [("Back", 2, f"{_ML}:card:{_BOB_ID}:-")]
    assert data["content"].split("\n")[1] == "A notice."


def test_queue_them_instead_is_the_queue_review_and_its_back_is_the_menu() -> None:
    event = _event()
    signups = [*_seats(2), _signup("Cy", status="queued", minute=40), _bob()]
    back = back_to_holders(event, _BOB_ID)
    data = mark_review_data(event, _BOB, signups[-1], "queued", "Fury Warrior", signups, reach="yes", back=back)
    assert _description(data) == [
        "Give **Bob** a seat as **Fury Warrior**?",
        "The raid is full, so they'd be **#2 in the queue**.",
    ]
    assert _buttons(data) == [
        ("Move and tell them", 1, f"{_ML}:markt:{_BOB_ID}:queued"),
        ("Move quietly", 2, f"{_ML}:markq:{_BOB_ID}:queued"),
        ("Move and say why", 2, f"{_ML}:markr:{_BOB_ID}:queued"),
        ("Back", 2, f"{_ML}:hold:{_BOB_ID}:1"),
    ]


def test_25_holders_fit_one_page() -> None:
    signups = [*_seats(25), _bob(status="tentative")]
    data = holders_data(_event(size_cap=25), _BOB, signups[-1], "Fury Warrior", signups)
    assert (len(_select(data)["options"]), _select(data)["placeholder"]) == (25, raid_manage_copy.PICK_HOLDER)
    assert [label for label, _, _ in _buttons(data)] == ["Queue them instead", "Back"]


@pytest.mark.parametrize(
    ("page", "shown", "first", "greyed"),
    [
        (1, 25, 1, raid_manage_copy.PREV_PAGE),
        (2, 1, 26, raid_manage_copy.NEXT_PAGE),
        (9, 1, 26, raid_manage_copy.NEXT_PAGE),  # a page gone since: the last one
    ],
)
def test_past_25_holders_the_menu_pages_and_keeps_a_stale_page_in_range(
    page: int, shown: int, first: int, greyed: str
) -> None:
    signups = [*_seats(26), _bob()]
    data = holders_data(_event(size_cap=26), _BOB, signups[-1], "Fury Warrior", signups, page=page)
    options = _select(data)["options"]
    assert (len(options), options[0]["label"]) == (shown, f"{first}. Mage{first - 1}")
    assert _select(data)["placeholder"] == f"Pick who goes to the bench ({first} to {first + shown - 1} of 26)"
    buttons = data["components"][1]["components"]
    assert [b["label"] for b in buttons][2:] == ["Queue them instead", "Back"]
    assert [b["custom_id"] for b in buttons][:2] == [f"{_ML}:hold:{_BOB_ID}:1", f"{_ML}:hold:{_BOB_ID}:2"]
    assert [b["label"] for b in buttons if b.get("disabled")] == [greyed]


# ---------------------------------------------------------------------------
# The swap review
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("notes_on", [True, False])
def test_the_review_names_both_and_shows_the_holders_note_only_while_notes_are_on(notes_on: bool) -> None:
    signups = [*_seats(2), _bob()]
    signups[1].note = "Leaving at 9 @here"
    lines = ["Give **Bob** a seat as **Fury Warrior**? **Mage1** (**Frost Mage**) goes to the **bench**."]
    if notes_on:
        lines.append('**Mage1**\'s note: "Leaving at 9 @​here"')
    assert _description(_review(signups, signups[1], signup_notes_enabled=notes_on)) == lines


def test_a_holder_with_no_class_or_name_is_named_plainly() -> None:
    holder = _signup(UNKNOWN_PLAYER, wow_class=None, role=None, spec=None)
    data = _review([holder, _bob()], holder, size_cap=1)
    assert _description(data) == [
        f"Give **Bob** a seat as **Fury Warrior**? <@{holder.discord_user_id}> goes to the **bench**."
    ]


@pytest.mark.parametrize(
    ("reach", "holder_reach", "verbs", "dms_off"),
    [
        ("yes", "yes", ["swapt", "swapq", "swapr"], []),
        ("yes", "self", ["swapt", "swapq"], []),  # the leader benching themself: no say-why
        ("off", "yes", ["swapt", "swapq", "swapr"], ["**Bob**"]),
        ("self", "off", [], ["**Mage1**"]),  # a DM reaches neither: just [Swap]
        ("off", "off", [], ["**Bob**", "**Mage1**"]),
    ],
)
def test_the_review_buttons_follow_whom_a_dm_reaches(
    reach: Reach, holder_reach: Reach, verbs: list[str], dms_off: list[str]
) -> None:
    signups = [*_seats(2), _bob()]
    data = swap_review_data(
        _event(), _BOB, signups[-1], "Fury Warrior", signups[1], signups, reach=reach, holder_reach=holder_reach
    )
    swaps = [(*_SWAPS[verb], f"{_ML}:{verb}:{_BOB_ID}:{_MAGE1_ID}") for verb in verbs]
    if not swaps:
        swaps = [("Swap", 1, f"{_ML}:swapq:{_BOB_ID}:{_MAGE1_ID}")]
    assert _buttons(data) == [*swaps, ("Back", 2, f"{_ML}:hold:{_BOB_ID}:1")]
    assert _description(data)[1:] == [raid_manage_copy.dm_off(who) for who in dms_off]


def test_the_limit_counts_the_holder_out_of_the_line() -> None:
    event = _event(class_limits={"warrior": 1})
    al = _signup("Al", minute=1)
    signups = [_signup("Mage0", wow_class="mage", spec="frost"), al, _bob()]
    # Al is the one warrior: Bob in his seat is still one.
    assert swap_limit(event, signups[-1], al, signups) is None
    hit = LimitHit("class", "warrior", 1, 1)
    assert swap_limit(event, signups[-1], signups[0], signups) == hit
    data = _review(signups, signups[0], class_limits={"warrior": 1})
    assert _description(data)[1] == raid_manage_copy.over_limit_ok(hit)


# ---------------------------------------------------------------------------
# The ids and the copy
# ---------------------------------------------------------------------------


def test_the_swap_ids_round_trip_and_fit_at_their_longest() -> None:
    member, holder = "9" * 20, "8" * 20
    swaps = [(verb, holder) for verb in _SWAPS]
    # [Queue them instead]'s review moves them to the queue.
    moves = [(verb, "queued") for verb in ("markt", "markq", "markr")]
    for verb, arg in [*swaps, *moves, ("hold", "2"), ("swap", "-"), ("queue", "-")]:
        assert parse(manage(_EVENT_ID, verb, member, arg)) == RaidCustomId("ml", _EVENT_ID, (verb, member, arg))
    assert len(manage(_EVENT_ID, "swapt", member, holder)) == 95 <= MAX_CUSTOM_ID_LEN
    tails = (("hold", "99"), ("swap", "-"), ("queue", "-"))
    assert [len(manage(_EVENT_ID, verb, member, arg)) for verb, arg in tails] == [76, 75, 76]


@pytest.mark.parametrize(
    "tail",
    [
        f"swapt:{_BOB_ID}:{_BOB_ID}",  # nobody swaps with themself
        f"swapt:{_BOB_ID}:-",
        f"swapq:-:{_MAGE1_ID}",
        f"swapr:{_BOB_ID}:Mage1",
        f"hold:{_BOB_ID}:0",
        f"hold:{_BOB_ID}:07",
        "hold:-:1",
        f"swap:{_BOB_ID}:{_MAGE1_ID}",  # the menu's value names the holder
        f"queue:{_BOB_ID}:1",
        f"markt:{_BOB_ID}:absence",
        f"mark:{_BOB_ID}:queued",  # a card asks for a seat; only [Queue them instead]'s review queues
    ],
)
def test_swap_ids_no_card_makes_are_refused(tail: str) -> None:
    assert parse(f"{_ML}:{tail}") is None


def test_the_copy() -> None:
    assert raid_manage_copy.holder_page(26, 40, 40) == "Pick who goes to the bench (26 to 40 of 40)"
    assert raid_manage_copy.swap_prompt("**Bob**", "Fury Warrior", "**Al**", "Frost Mage") == (
        "Give **Bob** a seat as **Fury Warrior**? **Al** (**Frost Mage**) goes to the **bench**."
    )
    assert raid_manage_copy.holder_note("**Al**", "Leaving at 9") == '**Al**\'s note: "Leaving at 9"'
    assert raid_manage_copy.swapped("**Bob**", "**Al**") == "**Bob** has a seat. **Al** is on the **bench**."
    assert raid_manage_copy.holder_lost_seat("**Al**") == "**Al** doesn't have a seat any more."
