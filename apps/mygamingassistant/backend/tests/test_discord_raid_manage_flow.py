"""End-to-end flows for Manage sign-ups: a raid's leader adding, switching and removing players.

The hub, the member menu, a player's cards and their buttons, through POST
/discord/interactions with the helpers in ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.wow import wow_raid_guild_repo, wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.discord.interaction import UNKNOWN_PLAYER

from discord_raid_harness import (
    APP_ID,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    TOKEN,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    custom_ids,
)
from discord_raid_manage_harness import (
    POST_LINK,
    RAID_NAME,
    card_description,
    card_embed,
    card_lines,
    fill_seats,
    ml,
    pick,
    place_in_line,
    post_now,
    posted_raid,
    raid_line_of,
    review_card,
    sign_up,
    signup_row,
    starts_unix,
    tap,
)

pytestmark = pytest.mark.asyncio

_BOB = "300000000000000001"
_CY = "300000000000000003"
_DI = "300000000000000004"
_EARLY = datetime(2026, 1, 1, tzinfo=timezone.utc)
_HASH = "0123456789abcdef0123456789abcdef"


# ---------------------------------------------------------------------------
# Adding
# ---------------------------------------------------------------------------


async def test_a_leader_adds_a_player_and_tells_them(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, "300000000000000002", "Al", "mage.frost")

    # --- the hub: the raid, its seats and the member menu
    hub = await post(tap(event, "open"))
    assert hub["type"] == 7
    assert card_lines(hub) == [raid_line_of(event), "**Seats:** 1/5 confirmed", raid_manage_copy.HUB_PROMPT]
    assert custom_ids(hub) == [ml(event, "who"), ml(event, "row"), ml(event, "done")]

    # --- Bob picked: his card, headed by his name and avatar
    card = await post(pick(event, _BOB, "Bob", avatar=_HASH))
    assert card["type"] == 7
    avatar = f"https://cdn.discordapp.com/avatars/{_BOB}/{_HASH}.png"
    assert card_embed(card)["author"] == {"name": "Bob", "icon_url": avatar}
    assert card_description(card) == raid_manage_copy.not_on_raid("**Bob**")

    # --- a class, then a spec: the review, and nothing changed yet
    specs = await post(tap(event, "class", _BOB, on=card, values=["warrior"]))
    assert card_description(specs) == "Which **Warrior** spec is **Bob** bringing?"
    review = await post(tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert card_description(review) == "Add **Bob** to this raid as **Fury Warrior**?"
    assert custom_ids(review) == [
        ml(event, "addt", _BOB, "warrior.fury"),
        ml(event, "addq", _BOB, "warrior.fury"),
        ml(event, "card", _BOB),
    ]
    assert await signup_row(db, event, _BOB) is None
    assert fake_discord.calls == []

    # --- [Add and tell them]: the hub says so; Bob has a seat, a DM and a line on the post
    hub = await post(tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert card_lines(hub) == [
        raid_line_of(event),
        "**Bob** is in as **Fury Warrior**.",
        raid_manage_copy.DM_SENDING,
        "**Seats:** 2/5 confirmed",
        raid_manage_copy.HUB_PROMPT,
    ]
    assert hub["data"]["embeds"] == []
    bob = await signup_row(db, event, _BOB)
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
            ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", None, POST_LINK, signups_open=True
        ),
        "allowed_mentions": {"parse": []},
    }
    assert "Bob" in post_now(fake_discord)
    # His name came with the card: Discord isn't asked for it.
    assert fake_discord.find("GET", f"/guilds/{GUILD}/members/{_BOB}") == []


async def test_adding_quietly_or_adding_yourself_sends_no_dm(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    review = await review_card(post, event, _BOB, "Bob", "priest.holy")
    hub = await post(tap(event, "addq", _BOB, "priest.holy", on=review))
    assert card_lines(hub)[1:3] == ["**Bob** is in as **Holy Priest**.", "**Seats:** 1/5 confirmed"]

    # --- the leader adding themself: just [Add]
    review = await review_card(post, event, ORGANISER, "Thrall", "warrior.protection")
    assert custom_ids(review) == [ml(event, "addq", ORGANISER, "warrior.protection"), ml(event, "card", ORGANISER)]
    hub = await post(tap(event, "addq", ORGANISER, "warrior.protection", on=review))
    assert card_lines(hub)[1:3] == ["**Thrall** is in as **Protection Warrior**.", "**Seats:** 2/5 confirmed"]
    assert fake_discord.find("POST", "/users/@me/channels") == []


async def test_adding_to_a_full_raid_queues_the_player(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")
    assert card_description(review).split("\n") == [
        "Add **Bob** to this raid as **Fury Warrior**?",
        "The raid is full, so they'd be **#1 in the queue**.",
    ]
    hub = await post(tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert card_lines(hub)[1:3] == [raid_manage_copy.added_queued("**Bob**", 1), raid_manage_copy.DM_SENDING]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None
    assert dm.body["content"] == raid_manage_copy.added_dm(
        ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", 1, POST_LINK, signups_open=True
    )

    # --- a queued player switched to another spec keeps their place
    queued_at = bob.signed_up_at
    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card) == f"**Bob** is **#1 in the queue** as **Fury Warrior**.\n{raid_manage_copy.QUEUE_WAITS}"
    specs = await post(tap(event, "class", _BOB, on=card, values=["warrior"]))
    card = await post(tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.arms"]))
    assert card_lines(card) == [raid_line_of(event), "Switched **Bob** to **Arms Warrior**."]
    assert card_description(card) == f"**Bob** is **#1 in the queue** as **Arms Warrior**.\n{raid_manage_copy.QUEUE_WAITS}"
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    assert (bob.status, bob.spec, bob.signed_up_at) == ("queued", "arms", queued_at)


async def test_a_player_back_from_absence_goes_to_the_end_of_the_line(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="absence")
    await fill_seats(db, event, 5)
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")
    await place_in_line(db, event, _BOB, _EARLY)  # Bob signed up before Cy did
    await place_in_line(db, event, _CY, _EARLY + timedelta(hours=1))

    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card).split("\n")[0] == raid_manage_copy.absent_note("**Bob**")
    specs = await post(tap(event, "class", _BOB, on=card, values=["warrior"]))
    review = await post(tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert card_description(review).split("\n")[1] == raid_manage_copy.would_queue(2)

    # --- added back: behind Cy, who was already waiting
    hub = await post(tap(event, "addq", _BOB, "warrior.fury", on=review))
    assert card_lines(hub)[1] == raid_manage_copy.added_queued("**Bob**", 2)
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"


async def test_leaders_may_go_over_a_limit_and_are_told(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.class_limits = {"warrior": 1}
    event.role_limits = {"tank": 1}
    await db.flush()
    await sign_up(db, event, "300000000000000002", "Al", "warrior.fury")
    await sign_up(db, event, "300000000000000004", "Di", "paladin.protection")

    card = await post(pick(event, _BOB, "Bob"))
    specs = await post(tap(event, "class", _BOB, on=card, values=["warrior"]))
    assert card_description(specs).endswith(f"\n{raid_manage_copy.SPEC_MARKS_NOTE}")
    review = await post(tap(event, "spec", _BOB, "warrior", on=specs, values=["warrior.fury"]))
    assert card_description(review).split("\n")[1] == (
        "**Warrior** is full (1/1). Leaders can go over limits, so this still works."
    )
    hub = await post(tap(event, "addq", _BOB, "warrior.fury", on=review))
    assert card_lines(hub)[1:3] == [
        "**Bob** is in as **Fury Warrior**.",
        "**Warrior** is full (1/1). Leaders can go over limits, so I added them anyway.",
    ]

    # --- switched into a role with no room: done, and said
    card = await post(pick(event, _BOB, "Bob"))
    specs = await post(tap(event, "class", _BOB, on=card, values=["tank"]))
    card = await post(tap(event, "spec", _BOB, "tank", on=specs, values=["warrior.protection"]))
    assert card_lines(card)[1:] == [
        "Switched **Bob** to **Protection Warrior**.",
        "The raid already has all the **tanks** it needs (1/1). Leaders can go over limits, so I switched them anyway.",
    ]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and (bob.role, bob.spec) == ("tank", "protection")

    # --- the same spec again (a card left open): nothing changes
    fake_discord.clear()
    card = await post(tap(event, "spec", _BOB, "tank", on=specs, values=["warrior.protection"]))
    assert card_lines(card)[1] == "Nothing changed. **Bob** is already **Protection Warrior**."
    assert fake_discord.calls == []


async def test_a_player_with_dm_reminders_off_is_added_without_one(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    stale = await review_card(post, event, _BOB, "Bob", "mage.fire")
    assert custom_ids(stale)[0] == ml(event, "addt", _BOB, "mage.fire")
    response = await post(command("raid", "prefs", user_id=_BOB, permissions=0, spec="mage.fire", dm_reminders=False))
    assert "Saved." in content(response)

    # --- the review says so, and only adds
    review = await review_card(post, event, _BOB, "Bob", "mage.fire")
    assert card_description(review).split("\n")[1] == raid_manage_copy.dm_off("**Bob**")
    assert custom_ids(review) == [ml(event, "addq", _BOB, "mage.fire"), ml(event, "card", _BOB)]

    # --- [Add and tell them] on a card from before: added, and no DM
    fake_discord.clear()
    hub = await post(tap(event, "addt", _BOB, "mage.fire", on=stale))
    assert card_lines(hub)[1:3] == ["**Bob** is in as **Fire Mage**.", raid_manage_copy.dm_off_done("**Bob**")]
    assert fake_discord.dms_to(_BOB) == []


async def test_a_dm_that_cant_go_out_is_reported_to_the_leader(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")
    fake_discord.fail("POST", f"/channels/dm-{_BOB}/messages", 403, 50007)
    await post(tap(event, "addt", _BOB, "warrior.fury", on=review))
    (followup,) = fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")
    assert followup.body is not None
    assert (followup.body["content"], followup.body["flags"]) == (raid_manage_copy.dm_failed("**Bob**"), 64)


async def test_a_tap_without_its_card_names_the_player_from_discord_then_their_sign_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    fake_discord.members[_BOB] = {"nick": None, "user": {"id": _BOB, "username": "bob", "global_name": "Bobby"}}
    hub = await post(tap(event, "addq", _BOB, "mage.frost"))  # no message came with the tap
    assert card_lines(hub)[1] == f"<@{_BOB}> is in as **Frost Mage**."
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.display_name == "Bobby"
    # Named before the post re-rendered.
    assert "Bobby" in post_now(fake_discord)
    assert UNKNOWN_PLAYER not in post_now(fake_discord)

    card = await post(tap(event, "card", _BOB))
    assert card_embed(card)["author"] == {"name": "Bobby"}
    assert card_description(card) == "**Bobby** is in as **Frost Mage**."


async def test_a_name_discord_wont_give_leaves_the_player_unnamed(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    fake_discord.fail("GET", f"/guilds/{GUILD}/members/{_BOB}", 404, 10007)
    hub = await post(tap(event, "addq", _BOB, "mage.frost"))  # no message came with the tap
    assert card_lines(hub)[1] == f"<@{_BOB}> is in as **Frost Mage**."
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.display_name == UNKNOWN_PLAYER
    assert len(fake_discord.find("GET", f"/guilds/{GUILD}/members/{_BOB}")) == 1
    post_now(fake_discord)  # the post re-rendered all the same


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------


async def test_removing_a_seat_holder_moves_the_queue_up_and_tells_them_both(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await fill_seats(db, event, 4)
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")

    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card) == "**Bob** is in as **Fury Warrior**."
    ask = await post(tap(event, "ask", _BOB, on=card))
    assert card_description(ask) == (
        "Remove **Bob** (**Fury Warrior**) from this raid? Their seat goes to the next player in the queue."
    )
    assert custom_ids(ask) == [ml(event, "dropt", _BOB), ml(event, "dropq", _BOB), ml(event, "card", _BOB)]

    # --- [Keep them] goes back to his card
    back = await post(tap(event, "card", _BOB, on=ask))
    assert card_embed(back) == card_embed(card)

    # --- [Remove and tell them]: Cy moves up; both get a DM
    hub = await post(tap(event, "dropt", _BOB, on=ask))
    assert card_lines(hub)[1:4] == [
        "Removed **Bob**. **Cy** moved up from the queue.",
        raid_manage_copy.DM_SENDING,
        "**Seats:** 5/5 confirmed",
    ]
    assert await signup_row(db, event, _BOB) is None
    cy = await signup_row(db, event, _CY)
    assert cy is not None and cy.status == "confirmed"
    (removed,) = fake_discord.dms_to(_BOB)
    assert removed.body is not None
    assert removed.body["content"] == raid_manage_copy.removed_dm(ORGANISER, RAID_NAME, starts_unix(event))
    (promoted,) = fake_discord.dms_to(_CY)
    assert promoted.body is not None
    assert promoted.body["content"] == raid_copy.promoted_dm(RAID_NAME, starts_unix(event), POST_LINK)
    shown = post_now(fake_discord)
    assert "Cy" in shown and "Bob" not in shown


@pytest.mark.parametrize("status", ["queued", "tentative", "bench"])
async def test_removing_a_player_without_a_seat_moves_nobody_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, status: str
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status=status)
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")

    card = await post(pick(event, _BOB, "Bob"))
    ask = await post(tap(event, "ask", _BOB, on=card))
    assert card_description(ask) == "Remove **Bob** (**Fury Warrior**) from this raid?"
    hub = await post(tap(event, "dropq", _BOB, on=ask))
    assert card_lines(hub)[1:3] == ["Removed **Bob**.", "**Seats:** 5/5 confirmed · 1 in queue"]
    assert await signup_row(db, event, _BOB) is None
    cy = await signup_row(db, event, _CY)
    assert cy is not None and cy.status == "queued"
    assert fake_discord.find("POST", "/users/@me/channels") == []


async def test_a_freed_seat_goes_to_the_first_queued_player_of_its_role(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await fill_seats(db, event, 4)
    await sign_up(db, event, _CY, "Cy", "priest.holy", status="queued")  # first in line, but a healer
    await sign_up(db, event, _DI, "Di", "rogue.combat", status="queued")
    response = await post(command("raid", "prefs", user_id=_DI, permissions=0, dm_reminders=False))
    assert "Saved." in content(response)
    fake_discord.clear()

    card = await post(pick(event, _BOB, "Bob"))
    ask = await post(tap(event, "ask", _BOB, on=card))
    hub = await post(tap(event, "dropt", _BOB, on=ask))
    assert card_lines(hub)[1] == "Removed **Bob**. **Di** moved up from the queue."
    di = await signup_row(db, event, _DI)
    cy = await signup_row(db, event, _CY)
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
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 4)
    event.closed_at = datetime.now(timezone.utc)
    await db.flush()

    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")
    await post(tap(event, "addt", _BOB, "warrior.fury", on=review))
    (added,) = fake_discord.dms_to(_BOB)
    assert added.body is not None
    assert added.body["content"] == raid_manage_copy.added_dm(
        ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", None, POST_LINK, signups_open=False
    )

    # --- Cy queued, then Bob's seat freed: Cy's DM points at the leader too
    review = await review_card(post, event, _CY, "Cy", "rogue.combat")
    await post(tap(event, "addq", _CY, "rogue.combat", on=review))
    card = await post(pick(event, _BOB, "Bob"))
    ask = await post(tap(event, "ask", _BOB, on=card))
    await post(tap(event, "dropq", _BOB, on=ask))
    (promoted,) = fake_discord.dms_to(_CY)
    assert promoted.body is not None
    assert promoted.body["content"] == raid_copy.promoted_dm(RAID_NAME, starts_unix(event), POST_LINK, ask_leader=ORGANISER)


async def test_a_card_left_open_acts_on_the_raid_as_it_is_now(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")

    # --- Bob signed up himself meanwhile: the add says so and changes nothing
    await sign_up(db, event, _BOB, "Bob", "mage.frost")
    card = await post(tap(event, "addt", _BOB, "warrior.fury", on=review))
    assert card_lines(card) == [raid_line_of(event), raid_manage_copy.already_on("**Bob**")]
    assert card_description(card) == "**Bob** is in as **Frost Mage**."
    ask = await post(tap(event, "ask", _BOB, on=card))

    # --- ... then left it: the removal says so
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    await wow_raid_signup_repo.delete(db, bob)
    hub = await post(tap(event, "dropq", _BOB, on=ask))
    assert card_lines(hub)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    card = await post(tap(event, "ask", _BOB, on=ask))
    assert card_lines(card)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    assert card_description(card) == raid_manage_copy.not_on_raid("**Bob**")
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# Who may manage, and when
# ---------------------------------------------------------------------------


async def test_only_the_raids_leader_manages_and_only_while_it_is_on(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    member = {"user_id": "300000000000000009", "permissions": 0}
    for verb, picked, arg in (("open", "-", "-"), ("card", _BOB, "-"), ("addq", _BOB, "mage.frost")):
        response = await post(tap(event, verb, picked, arg, **member))
        assert response["type"] == 7
        assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
    response = await post(pick(event, _BOB, "Bob", **member))
    assert content(response) == raid_copy.NOT_LEADER
    assert await signup_row(db, event, _BOB) is None

    # --- a bot can't be picked, nor a menu value that isn't a member
    response = await post(pick(event, "300000000000000010", "Helper", bot=True))
    assert card_lines(response)[1] == raid_copy.LEADER_BOT
    response = await post(tap(event, "who", values=["nobody"]))
    assert content(response) == raid_copy.GENERIC_ERROR

    # --- [Done] closes the card
    response = await post(tap(event, "done"))
    assert (content(response), custom_ids(response)) == (raid_manage_copy.DONE, [])

    # --- a cancelled raid's sign-ups stay as they are
    event.status = "cancelled"
    await db.flush()
    for verb, picked, arg in (("open", "-", "-"), ("addq", _BOB, "mage.frost")):
        response = await post(tap(event, verb, picked, arg))
        assert (content(response), custom_ids(response)) == (raid_manage_copy.GONE, [])
    assert await signup_row(db, event, _BOB) is None
    assert fake_discord.calls == []


async def test_the_raids_leader_needs_no_manage_events_until_it_is_handed_on(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    # The organiser created the raid, so leads it.
    hub = await post(tap(event, "open", permissions=0))
    assert card_lines(hub)[-1] == raid_manage_copy.HUB_PROMPT
    card = await post(pick(event, _BOB, "Bob", permissions=0))
    hub = await post(tap(event, "addq", _BOB, "mage.frost", on=card, permissions=0))
    assert card_lines(hub)[1] == "**Bob** is in as **Frost Mage**."

    # --- handed to Cy: the organiser no longer gets in; Cy does
    event.leader_user_id = _CY
    await db.flush()
    response = await post(tap(event, "open", permissions=0))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
    hub = await post(tap(event, "open", user_id=_CY, permissions=0))
    assert card_lines(hub)[-1] == raid_manage_copy.HUB_PROMPT


async def test_a_raid_that_isnt_this_servers_or_isnt_up_yet_is_not_found(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    response = await post(click(f"raid:v1:ml:{uuid.uuid4()}:open:-:-", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])

    # --- a draft
    event.status = "draft"
    await db.flush()
    response = await post(tap(event, "open"))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])

    # --- another server's raid
    other = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="800000000000000002")
    event.status = "scheduled"
    event.guild_id = other.id
    await db.flush()
    for verb, picked, arg in (("open", "-", "-"), ("addq", _BOB, "mage.frost")):
        response = await post(tap(event, verb, picked, arg))
        assert (content(response), custom_ids(response)) == (raid_copy.NOT_FOUND, [])
    assert await signup_row(db, event, _BOB) is None
    assert fake_discord.calls == []
