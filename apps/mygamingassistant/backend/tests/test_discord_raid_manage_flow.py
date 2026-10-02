"""End-to-end flows for Manage sign-ups: a raid's leader adding, switching and removing players.

The hub, the member menu, a player's cards and their buttons, through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
Each tap carries the card it was made on (*on*), as Discord sends it, so
the player's name rides along in the card's author line.  Sign-ups the
tests start from are written straight to the repository.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_guild_repo, wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.discord.interaction import UNKNOWN_PLAYER
from app.services.wow.raid_catalog import spec_info

from discord_raid_harness import (
    APP_ID,
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    TOKEN,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    create_and_post,
    custom_ids,
    pick_user,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_BOB = "300000000000000001"
_CY = "300000000000000003"
_DI = "300000000000000004"
_EARLY = datetime(2026, 1, 1, tzinfo=timezone.utc)
_HASH = "0123456789abcdef0123456789abcdef"
_LINK = f"https://discord.com/channels/{GUILD}/{CHANNEL}/m1"
_RAID = "Onyxia's Lair"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


async def _sign_up(
    db: AsyncSession, event: WowRaidEvent, user_id: str, name: str, choice: str, status: str = "confirmed"
) -> None:
    """*user_id* signed up as *choice* ('mage.frost')."""
    wow_class, spec_key = choice.split(".")
    spec = spec_info(wow_class, spec_key)
    assert spec is not None
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        display_name=name,
        status=status,
        wow_class=wow_class,
        role=spec.raid_role,
        spec=spec_key,
    )


async def _fill(db: AsyncSession, event: WowRaidEvent, count: int) -> None:
    """*count* Frost Mages with seats."""
    for n in range(count):
        await _sign_up(db, event, f"30000000000000010{n}", f"Mage{n}", "mage.frost")


async def _row(db: AsyncSession, event: WowRaidEvent, user_id: str) -> WowRaidSignup | None:
    row = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id=user_id)
    if row is not None:
        await db.refresh(row)
    return row


async def _place_in_line(db: AsyncSession, event: WowRaidEvent, user_id: str, when: datetime) -> None:
    """Date *user_id*'s sign-up *when* (the order every list goes by)."""
    row = await _row(db, event, user_id)
    assert row is not None
    row.signed_up_at = when
    await db.flush()


def _ml(event: WowRaidEvent, verb: str, member: str = "-", arg: str = "-") -> str:
    return f"raid:v1:ml:{event.id}:{verb}:{member}:{arg}"


def _tap(
    event: WowRaidEvent,
    verb: str,
    member: str = "-",
    arg: str = "-",
    *,
    on: dict[str, Any] | None = None,
    values: list[str] | None = None,
    user_id: str = ORGANISER,
    permissions: int = ORGANISER_PERMS,
) -> dict[str, Any]:
    """A tap on a Manage sign-ups card — by the organiser unless said otherwise — made on the card *on*."""
    message = None
    if on is not None:
        message = on["data"]
    custom_id = _ml(event, verb, member, arg)
    return click(custom_id, user_id=user_id, permissions=permissions, values=values, message=message)


def _pick(event: WowRaidEvent, picked_id: str, name: str, **kwargs: Any) -> dict[str, Any]:
    """A member picked in the hub's menu."""
    return pick_user(_ml(event, "who"), picked_id, picked_name=name, **kwargs)


async def _review(post: Post, event: WowRaidEvent, picked_id: str, name: str, choice: str) -> dict[str, Any]:
    """Pick *picked_id* on the hub, then the class and spec of *choice*: the review card."""
    spec = spec_info(*choice.split("."))
    assert spec is not None
    card = await post(_pick(event, picked_id, name))
    specs = await post(_tap(event, "class", picked_id, on=card, values=[spec.column]))
    return await post(_tap(event, "spec", picked_id, spec.column, on=specs, values=[choice]))


def _embed(response: dict[str, Any]) -> dict[str, Any]:
    [embed] = response["data"]["embeds"]
    return embed


def _description(response: dict[str, Any]) -> str:
    return _embed(response)["description"]


def _lines(response: dict[str, Any]) -> list[str]:
    return content(response).split("\n")


def _unix(event: WowRaidEvent) -> int:
    return int(event.starts_at.timestamp())


def _raid_line(event: WowRaidEvent) -> str:
    return f"**{_RAID}** · <t:{_unix(event)}:F>"


def _post_now(fake_discord: FakeDiscord) -> str:
    """The public post as last re-rendered."""
    edits = fake_discord.public_edits()
    assert edits, "the post wasn't re-rendered"
    return json.dumps(edits[-1].body, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Adding
# ---------------------------------------------------------------------------


async def test_a_leader_adds_a_player_and_tells_them(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "300000000000000002", "Al", "mage.frost")

    # --- the hub: the raid, its seats and the member menu
    hub = await post(_tap(event, "open"))
    assert hub["type"] == 7
    assert _lines(hub) == [_raid_line(event), "**Seats:** 1/5 confirmed", raid_manage_copy.HUB_PROMPT]
    assert custom_ids(hub) == [_ml(event, "who"), _ml(event, "done")]

    # --- Bob picked: his card, headed by his name and avatar
    card = await post(_pick(event, _BOB, "Bob", avatar=_HASH))
    assert card["type"] == 7
    avatar = f"https://cdn.discordapp.com/avatars/{_BOB}/{_HASH}.png"
    assert _embed(card)["author"] == {"name": "Bob", "icon_url": avatar}
    assert _description(card) == raid_manage_copy.not_on_raid("**Bob**")

    # --- a class, then a spec: the review, and nothing changed yet
    specs = await post(_tap(event, "class", _BOB, on=card, values=["warrior"]))
    assert _description(specs) == "Which **Warrior** spec is **Bob** bringing?"
    review = await post(_tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert _description(review) == "Add **Bob** to this raid as **Fury Warrior**?"
    assert custom_ids(review) == [
        _ml(event, "addt", _BOB, "warrior.fury"),
        _ml(event, "addq", _BOB, "warrior.fury"),
        _ml(event, "card", _BOB),
    ]
    assert await _row(db, event, _BOB) is None
    assert fake_discord.calls == []

    # --- [Add and tell them]: the hub says so; Bob has a seat, a DM and a line on the post
    hub = await post(_tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert _lines(hub) == [
        _raid_line(event),
        "**Bob** is in as **Fury Warrior**.",
        raid_manage_copy.DM_SENDING,
        "**Seats:** 2/5 confirmed",
        raid_manage_copy.HUB_PROMPT,
    ]
    assert hub["data"]["embeds"] == []
    bob = await _row(db, event, _BOB)
    assert bob is not None
    assert (bob.display_name, bob.status, bob.wow_class, bob.role, bob.spec) == (
        "Bob",
        "confirmed",
        "warrior",
        "dps",
        "fury",
    )
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body == {
        "content": raid_manage_copy.added_dm(
            ORGANISER, _RAID, _unix(event), "Fury Warrior", None, _LINK, signups_open=True
        ),
        "allowed_mentions": {"parse": []},
    }
    assert "Bob" in _post_now(fake_discord)
    # His name came with the card: Discord isn't asked for it.
    assert fake_discord.find("GET", f"/guilds/{GUILD}/members/{_BOB}") == []


async def test_adding_quietly_or_adding_yourself_sends_no_dm(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    review = await _review(post, event, _BOB, "Bob", "priest.holy")
    hub = await post(_tap(event, "addq", _BOB, "priest.holy", on=review))
    assert _lines(hub)[1:3] == ["**Bob** is in as **Holy Priest**.", "**Seats:** 1/5 confirmed"]

    # --- the leader adding themself: just [Add]
    review = await _review(post, event, ORGANISER, "Thrall", "warrior.protection")
    assert custom_ids(review) == [_ml(event, "addq", ORGANISER, "warrior.protection"), _ml(event, "card", ORGANISER)]
    hub = await post(_tap(event, "addq", ORGANISER, "warrior.protection", on=review))
    assert _lines(hub)[1:3] == ["**Thrall** is in as **Protection Warrior**.", "**Seats:** 2/5 confirmed"]
    assert fake_discord.find("POST", "/users/@me/channels") == []


async def test_adding_to_a_full_raid_queues_the_player(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    await _fill(db, event, 5)
    review = await _review(post, event, _BOB, "Bob", "warrior.fury")
    assert _description(review).split("\n") == [
        "Add **Bob** to this raid as **Fury Warrior**?",
        "The raid is full, so they'd be **#1 in the queue**.",
    ]
    hub = await post(_tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert _lines(hub)[1:3] == [raid_manage_copy.added_queued("**Bob**", 1), raid_manage_copy.DM_SENDING]
    bob = await _row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None
    assert dm.body["content"] == raid_manage_copy.added_dm(
        ORGANISER, _RAID, _unix(event), "Fury Warrior", 1, _LINK, signups_open=True
    )

    # --- a queued player switched to another spec keeps their place
    queued_at = bob.signed_up_at
    card = await post(_pick(event, _BOB, "Bob"))
    assert _description(card) == "**Bob** is **#1 in the queue** as **Fury Warrior**."
    specs = await post(_tap(event, "class", _BOB, on=card, values=["warrior"]))
    card = await post(_tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.arms"]))
    assert _lines(card) == [_raid_line(event), "Switched **Bob** to **Arms Warrior**."]
    assert _description(card) == "**Bob** is **#1 in the queue** as **Arms Warrior**."
    bob = await _row(db, event, _BOB)
    assert bob is not None
    assert (bob.status, bob.spec, bob.signed_up_at) == ("queued", "arms", queued_at)


async def test_a_player_back_from_absence_goes_to_the_end_of_the_line(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, _BOB, "Bob", "warrior.fury", status="absence")
    await _fill(db, event, 5)
    await _sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")
    await _place_in_line(db, event, _BOB, _EARLY)  # Bob signed up before Cy did
    await _place_in_line(db, event, _CY, _EARLY + timedelta(hours=1))

    card = await post(_pick(event, _BOB, "Bob"))
    assert _description(card) == raid_manage_copy.absent("**Bob**")
    specs = await post(_tap(event, "class", _BOB, on=card, values=["warrior"]))
    review = await post(_tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert _description(review).split("\n")[1] == raid_manage_copy.would_queue(2)

    # --- added back: behind Cy, who was already waiting
    hub = await post(_tap(event, "addq", _BOB, "warrior.fury", on=review))
    assert _lines(hub)[1] == raid_manage_copy.added_queued("**Bob**", 2)
    bob = await _row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"


async def test_leaders_may_go_over_a_limit_and_are_told(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.class_limits = {"warrior": 1}
    event.role_limits = {"tank": 1}
    await db.flush()
    await _sign_up(db, event, "300000000000000002", "Al", "warrior.fury")
    await _sign_up(db, event, "300000000000000004", "Di", "paladin.protection")

    card = await post(_pick(event, _BOB, "Bob"))
    specs = await post(_tap(event, "class", _BOB, on=card, values=["warrior"]))
    assert _description(specs).endswith(f"\n{raid_manage_copy.SPEC_MARKS_NOTE}")
    review = await post(_tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert _description(review).split("\n")[1] == (
        "**Warrior** is full (1/1). Leaders can go over limits, so this still works."
    )
    hub = await post(_tap(event, "addq", _BOB, "warrior.fury", on=review))
    assert _lines(hub)[1:3] == [
        "**Bob** is in as **Fury Warrior**.",
        "**Warrior** is full (1/1). Leaders can go over limits, so I added them anyway.",
    ]

    # --- switched into a role with no room: done, and said
    card = await post(_pick(event, _BOB, "Bob"))
    specs = await post(_tap(event, "class", _BOB, on=card, values=["tank"]))
    card = await post(_tap(event, "spec", _BOB, "tank", on=specs, values=["warrior.protection"]))
    assert _lines(card)[1:] == [
        "Switched **Bob** to **Protection Warrior**.",
        "The raid already has all the **tanks** it needs (1/1). Leaders can go over limits, so I switched them anyway.",
    ]
    bob = await _row(db, event, _BOB)
    assert bob is not None and (bob.role, bob.spec) == ("tank", "protection")

    # --- the same spec again (a card left open): nothing changes
    fake_discord.clear()
    card = await post(_tap(event, "spec", _BOB, "tank", on=specs, values=["warrior.protection"]))
    assert _lines(card)[1] == "Nothing changed. **Bob** is already **Protection Warrior**."
    assert fake_discord.calls == []


async def test_a_player_with_dm_reminders_off_is_added_without_one(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    stale = await _review(post, event, _BOB, "Bob", "mage.fire")
    assert custom_ids(stale)[0] == _ml(event, "addt", _BOB, "mage.fire")
    response = await post(command("raid", "prefs", user_id=_BOB, permissions=0, spec="mage.fire", dm_reminders=False))
    assert "Saved." in content(response)

    # --- the review says so, and only adds
    review = await _review(post, event, _BOB, "Bob", "mage.fire")
    assert _description(review).split("\n")[1] == raid_manage_copy.dm_off("**Bob**")
    assert custom_ids(review) == [_ml(event, "addq", _BOB, "mage.fire"), _ml(event, "card", _BOB)]

    # --- [Add and tell them] on a card from before: added, and no DM
    fake_discord.clear()
    hub = await post(_tap(event, "addt", _BOB, "mage.fire", on=stale))
    assert _lines(hub)[1:3] == ["**Bob** is in as **Fire Mage**.", raid_manage_copy.dm_off_done("**Bob**")]
    assert fake_discord.dms_to(_BOB) == []


async def test_a_dm_that_cant_go_out_is_reported_to_the_leader(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    review = await _review(post, event, _BOB, "Bob", "warrior.fury")
    fake_discord.fail("POST", f"/channels/dm-{_BOB}/messages", 403, 50007)
    await post(_tap(event, "addt", _BOB, "warrior.fury", on=review))
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None
    assert (followup.body["content"], followup.body["flags"]) == (raid_manage_copy.dm_failed("**Bob**"), 64)


async def test_a_tap_without_its_card_names_the_player_from_discord_then_their_sign_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.members[_BOB] = {"nick": None, "user": {"id": _BOB, "username": "bob", "global_name": "Bobby"}}
    hub = await post(_tap(event, "addq", _BOB, "mage.frost"))  # no message came with the tap
    assert _lines(hub)[1] == f"<@{_BOB}> is in as **Frost Mage**."
    bob = await _row(db, event, _BOB)
    assert bob is not None and bob.display_name == "Bobby"
    # Named before the post re-rendered.
    assert "Bobby" in _post_now(fake_discord)
    assert UNKNOWN_PLAYER not in _post_now(fake_discord)

    card = await post(_tap(event, "card", _BOB))
    assert _embed(card)["author"] == {"name": "Bobby"}
    assert _description(card) == "**Bobby** is in as **Frost Mage**."


async def test_a_name_discord_wont_give_leaves_the_player_unnamed(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.fail("GET", f"/guilds/{GUILD}/members/{_BOB}", 404, 10007)
    hub = await post(_tap(event, "addq", _BOB, "mage.frost"))  # no message came with the tap
    assert _lines(hub)[1] == f"<@{_BOB}> is in as **Frost Mage**."
    bob = await _row(db, event, _BOB)
    assert bob is not None and bob.display_name == UNKNOWN_PLAYER
    assert len(fake_discord.find("GET", f"/guilds/{GUILD}/members/{_BOB}")) == 1
    _post_now(fake_discord)  # the post re-rendered all the same


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------


async def test_removing_a_seat_holder_moves_the_queue_up_and_tells_them_both(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await _fill(db, event, 4)
    await _sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")

    card = await post(_pick(event, _BOB, "Bob"))
    assert _description(card) == "**Bob** is in as **Fury Warrior**."
    ask = await post(_tap(event, "ask", _BOB, on=card))
    assert _description(ask) == (
        "Remove **Bob** (**Fury Warrior**) from this raid? Their seat goes to the next player in the queue."
    )
    assert custom_ids(ask) == [_ml(event, "dropt", _BOB), _ml(event, "dropq", _BOB), _ml(event, "card", _BOB)]

    # --- [Keep them] goes back to his card
    back = await post(_tap(event, "card", _BOB, on=ask))
    assert _embed(back) == _embed(card)

    # --- [Remove and tell them]: Cy moves up; both get a DM
    hub = await post(_tap(event, "dropt", _BOB, on=ask))
    assert _lines(hub)[1:4] == [
        "Removed **Bob**. **Cy** moved up from the queue.",
        raid_manage_copy.DM_SENDING,
        "**Seats:** 5/5 confirmed",
    ]
    assert await _row(db, event, _BOB) is None
    cy = await _row(db, event, _CY)
    assert cy is not None and cy.status == "confirmed"
    (removed,) = fake_discord.dms_to(_BOB)
    assert removed.body is not None
    assert removed.body["content"] == raid_manage_copy.removed_dm(ORGANISER, _RAID, _unix(event))
    (promoted,) = fake_discord.dms_to(_CY)
    assert promoted.body is not None
    assert promoted.body["content"] == raid_copy.promoted_dm(_RAID, _unix(event), _LINK)
    shown = _post_now(fake_discord)
    assert "Cy" in shown and "Bob" not in shown


@pytest.mark.parametrize("status", ["queued", "tentative", "bench"])
async def test_removing_a_player_without_a_seat_moves_nobody_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, status: str
) -> None:
    event = await _raid(post, db, fake_discord)
    await _fill(db, event, 5)
    await _sign_up(db, event, _BOB, "Bob", "warrior.fury", status=status)
    await _sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")

    card = await post(_pick(event, _BOB, "Bob"))
    ask = await post(_tap(event, "ask", _BOB, on=card))
    assert _description(ask) == "Remove **Bob** (**Fury Warrior**) from this raid?"
    hub = await post(_tap(event, "dropq", _BOB, on=ask))
    assert _lines(hub)[1:3] == ["Removed **Bob**.", "**Seats:** 5/5 confirmed · 1 in queue"]
    assert await _row(db, event, _BOB) is None
    cy = await _row(db, event, _CY)
    assert cy is not None and cy.status == "queued"
    assert fake_discord.find("POST", "/users/@me/channels") == []


async def test_a_freed_seat_goes_to_the_first_queued_player_of_its_role(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await _fill(db, event, 4)
    await _sign_up(db, event, _CY, "Cy", "priest.holy", status="queued")  # first in line, but a healer
    await _sign_up(db, event, _DI, "Di", "rogue.combat", status="queued")
    response = await post(command("raid", "prefs", user_id=_DI, permissions=0, dm_reminders=False))
    assert "Saved." in content(response)
    fake_discord.clear()

    card = await post(_pick(event, _BOB, "Bob"))
    ask = await post(_tap(event, "ask", _BOB, on=card))
    hub = await post(_tap(event, "dropt", _BOB, on=ask))
    assert _lines(hub)[1] == "Removed **Bob**. **Di** moved up from the queue."
    di = await _row(db, event, _DI)
    cy = await _row(db, event, _CY)
    assert di is not None and di.status == "confirmed"
    assert cy is not None and cy.status == "queued"
    # Bob is told; Di turned DM reminders off, so isn't.
    assert len(fake_discord.dms_to(_BOB)) == 1
    assert fake_discord.dms_to(_DI) == []
    assert fake_discord.dms_to(_CY) == []


async def test_once_sign_ups_close_the_dms_point_players_at_the_leader(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    """The post's Absence button no longer works then."""
    event = await _raid(post, db, fake_discord)
    await _fill(db, event, 4)
    event.closed_at = datetime.now(timezone.utc)
    await db.flush()

    review = await _review(post, event, _BOB, "Bob", "warrior.fury")
    await post(_tap(event, "addt", _BOB, "warrior.fury", on=review))
    (added,) = fake_discord.dms_to(_BOB)
    assert added.body is not None
    assert added.body["content"] == raid_manage_copy.added_dm(
        ORGANISER, _RAID, _unix(event), "Fury Warrior", None, _LINK, signups_open=False
    )

    # --- Cy queued, then Bob's seat freed: Cy's DM points at the leader too
    review = await _review(post, event, _CY, "Cy", "rogue.combat")
    await post(_tap(event, "addq", _CY, "rogue.combat", on=review))
    card = await post(_pick(event, _BOB, "Bob"))
    ask = await post(_tap(event, "ask", _BOB, on=card))
    await post(_tap(event, "dropq", _BOB, on=ask))
    (promoted,) = fake_discord.dms_to(_CY)
    assert promoted.body is not None
    assert promoted.body["content"] == raid_copy.promoted_dm(_RAID, _unix(event), _LINK, ask_leader=ORGANISER)


async def test_a_card_left_open_acts_on_the_raid_as_it_is_now(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    review = await _review(post, event, _BOB, "Bob", "warrior.fury")

    # --- Bob signed up himself meanwhile: the add says so and changes nothing
    await _sign_up(db, event, _BOB, "Bob", "mage.frost")
    card = await post(_tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert _lines(card) == [_raid_line(event), raid_manage_copy.already_on("**Bob**")]
    assert _description(card) == "**Bob** is in as **Frost Mage**."
    ask = await post(_tap(event, "ask", _BOB, on=card))

    # --- ... then left it: the removal says so
    bob = await _row(db, event, _BOB)
    assert bob is not None
    await wow_raid_signup_repo.delete(db, bob)
    hub = await post(_tap(event, "dropq", _BOB, on=ask))
    assert _lines(hub)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    card = await post(_tap(event, "ask", _BOB, on=ask))
    assert _lines(card)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    assert _description(card) == raid_manage_copy.not_on_raid("**Bob**")
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# Who may manage, and when
# ---------------------------------------------------------------------------


async def test_only_the_raids_leader_manages_and_only_while_it_is_on(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    member = {"user_id": "300000000000000009", "permissions": 0}
    for verb, picked, arg in (("open", "-", "-"), ("card", _BOB, "-"), ("addq", _BOB, "mage.frost")):
        response = await post(_tap(event, verb, picked, arg, **member))
        assert response["type"] == 7
        assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
    response = await post(_pick(event, _BOB, "Bob", **member))
    assert content(response) == raid_copy.NOT_LEADER
    assert await _row(db, event, _BOB) is None

    # --- a bot can't be picked, nor a menu value that isn't a member
    response = await post(_pick(event, "300000000000000010", "Helper", bot=True))
    assert _lines(response)[1] == raid_copy.LEADER_BOT
    response = await post(_tap(event, "who", values=["nobody"]))
    assert content(response) == raid_copy.GENERIC_ERROR

    # --- [Done] closes the card
    response = await post(_tap(event, "done"))
    assert (content(response), custom_ids(response)) == (raid_manage_copy.DONE, [])

    # --- a cancelled raid's sign-ups stay as they are
    event.status = "cancelled"
    await db.flush()
    for verb, picked, arg in (("open", "-", "-"), ("addq", _BOB, "mage.frost")):
        response = await post(_tap(event, verb, picked, arg))
        assert (content(response), custom_ids(response)) == (raid_manage_copy.GONE, [])
    assert await _row(db, event, _BOB) is None
    assert fake_discord.calls == []


async def test_the_raids_leader_needs_no_manage_events_until_it_is_handed_on(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    # The organiser created the raid, so leads it.
    hub = await post(_tap(event, "open", permissions=0))
    assert _lines(hub)[-1] == raid_manage_copy.HUB_PROMPT
    card = await post(_pick(event, _BOB, "Bob", permissions=0))
    hub = await post(_tap(event, "addq", _BOB, "mage.frost", on=card, permissions=0))
    assert _lines(hub)[1] == "**Bob** is in as **Frost Mage**."

    # --- handed to Cy: the organiser no longer gets in; Cy does
    event.leader_user_id = _CY
    await db.flush()
    response = await post(_tap(event, "open", permissions=0))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
    hub = await post(_tap(event, "open", user_id=_CY, permissions=0))
    assert _lines(hub)[-1] == raid_manage_copy.HUB_PROMPT


async def test_a_raid_that_isnt_this_servers_or_isnt_up_yet_is_not_found(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(click(f"raid:v1:ml:{uuid.uuid4()}:open:-:-", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])

    # --- a draft
    event.status = "draft"
    await db.flush()
    response = await post(_tap(event, "open"))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])

    # --- another server's raid
    other = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="800000000000000002")
    event.status = "scheduled"
    event.guild_id = other.id
    await db.flush()
    for verb, picked, arg in (("open", "-", "-"), ("addq", _BOB, "mage.frost")):
        response = await post(_tap(event, verb, picked, arg))
        assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])
    assert await _row(db, event, _BOB) is None
    assert fake_discord.calls == []
