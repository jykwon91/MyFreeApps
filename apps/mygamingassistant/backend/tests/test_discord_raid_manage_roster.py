"""Manage sign-ups' menu of the raid's own sign-ups: its order, its pages and picking from it.

The member menu lists only people still in the server; this one lists the
raid's sign-ups, so a seat held by someone who left can still be changed or
freed.  The first sections are pure builders; the flows go through POST
/discord/interactions with the helpers in ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.discord.raid_manage_views import hub_data
from app.services.wow.raid_custom_id import MANAGE_MAX_PAGE, RaidCustomId, manage, parse

from discord_raid_harness import APP_ID, TOKEN, FakeDiscord, Post, content, custom_ids
from discord_raid_manage_harness import (
    card_description,
    card_embed,
    card_lines,
    fill_seats,
    ml,
    posted_raid,
    sign_up,
    signup_row,
    tap,
)

_STARTS = datetime(2026, 10, 11, 0, 0, tzinfo=timezone.utc)
_T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
_EVENT_ID = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
_ML = f"raid:v1:ml:{_EVENT_ID}"
_BOB = "300000000000000001"
_CY = "300000000000000003"


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
    status: str = "confirmed",
    wow_class: str | None = "warrior",
    role: str | None = "dps",
    spec: str | None = "fury",
    minute: int = 0,
) -> WowRaidSignup:
    return WowRaidSignup(
        event_id=_EVENT_ID,
        discord_user_id=str(200_000_000_000_000_000 + minute),
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=role,
        spec=spec,
        signed_up_at=_T0 + timedelta(minutes=minute),
        updated_at=_T0,
    )


def _seats(count: int) -> list[WowRaidSignup]:
    """*count* Frost Mages with seats, Mage0 first."""
    return [_signup(f"Mage{n}", wow_class="mage", spec="frost", minute=n) for n in range(count)]


def _roster(data: dict[str, Any]) -> dict[str, Any]:
    """The hub's menu of the raid's sign-ups."""
    [menu] = [c for row in data["components"] for c in row["components"] if c["type"] == 3]
    return menu


def _buttons(data: dict[str, Any]) -> list[tuple[str, str, bool]]:
    return [
        (c["label"], c["custom_id"], c.get("disabled", False))
        for row in data["components"]
        for c in row["components"]
        if c["type"] == 2
    ]


def _ids(data: dict[str, Any]) -> list[str]:
    return [c["custom_id"] for row in data["components"] for c in row["components"]]


# ---------------------------------------------------------------------------
# The menu
# ---------------------------------------------------------------------------


def test_the_menu_lists_the_line_then_tentative_then_bench() -> None:
    """Numbered as on the post; an absence isn't on the raid, so isn't listed."""
    signups = [
        _signup("Ed", status="tentative", wow_class="rogue", spec="combat", minute=0),
        _signup("Al", wow_class="mage", spec="frost", minute=1),
        _signup("Cy", status="late", minute=2),
        _signup("Di", status="queued", wow_class="priest", role="healer", spec="holy", minute=3),
        _signup("Fy", status="bench", role="tank", spec="protection", minute=4),
        _signup("Gus", status="absence", minute=5),
        _signup("Hal", status="queued", minute=6),
    ]
    data = hub_data(_event(), signups)
    # The member menu, this one, then [Done].
    assert [row["components"][0]["type"] for row in data["components"]] == [5, 3, 2]
    menu = _roster(data)
    assert (menu["custom_id"], menu["placeholder"]) == (f"{_ML}:row:-:-", raid_manage_copy.PICK_SIGNED_UP)
    assert (menu["min_values"], menu["max_values"]) == (1, 1)
    assert [(o["label"], o["description"]) for o in menu["options"]] == [
        ("1. Al", "Frost Mage"),
        ("2. Cy", "Fury Warrior · late"),
        ("3. Di", "Holy Priest · #1 in the queue"),
        ("4. Hal", "Fury Warrior · #2 in the queue"),
        ("Ed", "Combat Rogue · tentative"),
        ("Fy", "Protection Warrior · bench"),
    ]
    ids = {s.display_name: s.discord_user_id for s in signups}
    assert [o["value"] for o in menu["options"]] == [ids[name] for name in ("Al", "Cy", "Di", "Hal", "Ed", "Fy")]
    assert _buttons(data) == [("Done", f"{_ML}:done:-:-", False)]


@pytest.mark.parametrize("signups", [[], [_signup("Gus", status="absence")]])
def test_with_nobody_on_the_raid_there_is_no_menu(signups: list[WowRaidSignup]) -> None:
    data = hub_data(_event(), signups)
    assert [row["components"][0]["type"] for row in data["components"]] == [5, 2]


def test_an_option_shows_the_name_as_it_is_cut_to_fit() -> None:
    """An option shows no markdown, so nothing is escaped; Discord takes 100 characters."""
    long = "W" * 120
    signups = [
        _signup("*Bob*_", minute=1),
        _signup(long, minute=2),
        _signup("Cy", status="tentative", wow_class=None, role=None, spec=None, minute=3),
        _signup("Di", wow_class=None, role=None, spec=None, minute=4),
    ]
    options = _roster(hub_data(_event(), signups))["options"]
    assert options[0] == {"label": "1. *Bob*_", "value": signups[0].discord_user_id, "description": "Fury Warrior"}
    assert options[1]["label"] == f"2. {long}"[:100]
    # No class picked: just where they stand, or nothing at all.
    assert options[2] == {"label": "3. Di", "value": signups[3].discord_user_id}
    assert options[3] == {"label": "Cy", "value": signups[2].discord_user_id, "description": "tentative"}


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------


def test_twenty_five_sign_ups_fit_one_page() -> None:
    data = hub_data(_event(), _seats(25))
    menu = _roster(data)
    assert (menu["placeholder"], len(menu["options"])) == (raid_manage_copy.PICK_SIGNED_UP, 25)
    assert _buttons(data) == [("Done", f"{_ML}:done:-:-", False)]


@pytest.mark.parametrize(
    ("count", "page", "first", "last", "back", "ahead"),
    [
        # [Previous] and [Next]: the page each goes to, and whether it's greyed out (then it names its own page).
        (26, 1, 1, 25, ("1", True), ("2", False)),
        (26, 2, 26, 26, ("1", False), ("2", True)),
        (61, 2, 26, 50, ("1", False), ("3", False)),
        (61, 3, 51, 61, ("2", False), ("3", True)),
    ],
)
def test_more_than_twenty_five_sign_ups_go_on_pages(
    count: int, page: int, first: int, last: int, back: tuple[str, bool], ahead: tuple[str, bool]
) -> None:
    data = hub_data(_event(), _seats(count), page=page)
    menu = _roster(data)
    assert menu["placeholder"] == f"Or pick someone signed up ({first} to {last} of {count})"
    assert [o["label"] for o in menu["options"]] == [f"{n}. Mage{n - 1}" for n in range(first, last + 1)]
    assert _buttons(data) == [
        ("Previous", f"{_ML}:list:-:{back[0]}", back[1]),
        ("Next", f"{_ML}:list:-:{ahead[0]}", ahead[1]),
        ("Done", f"{_ML}:done:-:-", False),
    ]
    ids = _ids(data)
    assert len(set(ids)) == len(ids)


@pytest.mark.parametrize(("asked", "shown"), [(0, 1), (-3, 1), (4, 3), (MANAGE_MAX_PAGE, 3)])
def test_a_page_past_either_end_shows_the_nearest_one(asked: int, shown: int) -> None:
    """A [Next] tapped after the list shrank, say."""
    event = _event()
    assert hub_data(event, _seats(61), page=asked) == hub_data(event, _seats(61), page=shown)


# ---------------------------------------------------------------------------
# Their custom ids
# ---------------------------------------------------------------------------


def test_the_menu_and_page_ids_parse() -> None:
    row = manage(_EVENT_ID, "row")
    last_page = manage(_EVENT_ID, "list", arg=str(MANAGE_MAX_PAGE))
    # Well inside Discord's 100.
    assert (len(row), len(last_page)) == (55, 57)
    assert parse(row) == RaidCustomId("ml", _EVENT_ID, ("row", "-", "-"))
    assert parse(last_page) == RaidCustomId("ml", _EVENT_ID, ("list", "-", "99"))


@pytest.mark.parametrize(
    "tail",
    [
        "list:-:0",
        "list:-:01",
        "list:-:100",
        "list:-:1a",
        "list:-:١",  # a digit, but not an ASCII one
        "list:-:-",
        "list:-:",
        f"list:{_BOB}:1",
        f"row:{_BOB}:-",
        "row:-:1",
    ],
)
def test_a_menu_or_page_id_out_of_shape_is_turned_away(tail: str) -> None:
    assert parse(f"{_ML}:{tail}") is None


# ---------------------------------------------------------------------------
# Picking from it
# ---------------------------------------------------------------------------


async def test_a_leader_picks_a_sign_up_off_the_menu_and_removes_them(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, event, _CY, "Cy", "priest.holy", status="tentative")

    hub = await post(tap(event, "open"))
    assert custom_ids(hub) == [ml(event, "who"), ml(event, "row"), ml(event, "done")]
    assert [(o["label"], o["value"], o["description"]) for o in _roster(hub["data"])["options"]] == [
        ("1. Bob", _BOB, "Fury Warrior"),
        ("Cy", _CY, "Holy Priest · tentative"),
    ]

    # --- Bob picked: his card, named from his sign-up, so Discord isn't asked
    card = await post(tap(event, "row", values=[_BOB], on=hub))
    assert card["type"] == 7
    assert card_embed(card)["author"] == {"name": "Bob"}
    assert card_description(card) == "**Bob** is in as **Fury Warrior**."
    assert fake_discord.calls == []

    # --- [Remove and tell them], and the DM can't reach him: the leader is told
    ask = await post(tap(event, "ask", _BOB, on=card))
    assert card_description(ask) == "Remove **Bob** (**Fury Warrior**) from this raid?"
    fake_discord.fail("POST", f"/channels/dm-{_BOB}/messages", 403, 50007)
    hub = await post(tap(event, "dropt", _BOB, on=ask))
    assert card_lines(hub)[1:3] == ["Removed **Bob**.", raid_manage_copy.DM_SENDING]
    assert await signup_row(db, event, _BOB) is None
    assert [o["value"] for o in _roster(hub["data"])["options"]] == [_CY]
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None
    assert (followup.body["content"], followup.body["flags"]) == (raid_manage_copy.dm_failed("**Bob**"), 64)


async def test_a_pick_off_a_menu_drawn_before_a_change_goes_by_the_raid_as_it_is_now(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, event, _CY, "Cy", "rogue.combat")
    hub = await post(tap(event, "open"))

    # --- Bob marked himself absent since: his card says so
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="absence")
    card = await post(tap(event, "row", values=[_BOB], on=hub))
    assert card_description(card) == raid_manage_copy.absent("**Bob**")

    # --- Cy left the raid since: the hub says so, and nobody's left to list
    cy = await signup_row(db, event, _CY)
    assert cy is not None
    await wow_raid_signup_repo.delete(db, cy)
    stale = await post(tap(event, "row", values=[_CY], on=hub))
    assert card_lines(stale)[1] == raid_manage_copy.gone_from_raid(f"<@{_CY}>")
    assert custom_ids(stale) == [ml(event, "who"), ml(event, "done")]

    # --- a value that isn't a member
    response = await post(tap(event, "row", values=["nobody"]))
    assert content(response) == raid_copy.GENERIC_ERROR
    assert fake_discord.calls == []


async def test_the_pager_turns_the_menus_pages(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    queued = [f"3000000000000002{n:02d}" for n in range(25)]
    for n, user_id in enumerate(queued):
        await sign_up(db, event, user_id, f"Q{n:02d}", "rogue.combat", status="queued")

    hub = await post(tap(event, "open"))
    assert _roster(hub["data"])["placeholder"] == raid_manage_copy.signed_up_page(1, 25, 30)
    turned = await post(tap(event, "list", arg="2", on=hub))
    assert turned["type"] == 7
    menu = _roster(turned["data"])
    assert menu["placeholder"] == raid_manage_copy.signed_up_page(26, 30, 30)
    # Five seats, then the queue: number 26 is Q20.
    assert [o["label"] for o in menu["options"]] == [f"{n}. Q{n - 6:02d}" for n in range(26, 31)]

    # --- ten left the queue since: a stale [Next] shows the one page there is
    for user_id in queued[:10]:
        row = await signup_row(db, event, user_id)
        assert row is not None
        await wow_raid_signup_repo.delete(db, row)
    hub = await post(tap(event, "list", arg="2", on=turned))
    assert custom_ids(hub) == [ml(event, "who"), ml(event, "row"), ml(event, "done")]
    assert len(_roster(hub["data"])["options"]) == 20

    # --- only the raid's leader turns them
    response = await post(tap(event, "list", arg="2", user_id="300000000000000009", permissions=0))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
