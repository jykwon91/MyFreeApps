"""Raid: Manage (right-click a member) and ``/raid-admin signup``: two more doors onto a player's card.

Through POST /discord/interactions with the helpers in
``discord_raid_manage_harness.py``.  Neither door writes anything or sends a
DM; every tap after is a Manage sign-ups verb, tested with those.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.discord.commands_spec import RAID_ADMIN_COMMAND, USER_COMMANDS
from app.services.discord.raid_context import utcnow
from app.services.discord.raid_views import event_choice_label

from discord_raid_harness import (
    ORGANISER,
    FakeDiscord,
    Post,
    assert_ephemeral,
    autocomplete,
    click,
    command,
    content,
    custom_ids,
    resolved_member,
    setup_guild,
    user_command,
)
from discord_raid_manage_harness import (
    card_description,
    card_embed,
    ml,
    posted_raid,
    raid_line_of,
    sign_up,
    signup_row,
)

_BOB = "300000000000000001"
_DI = "300000000000000004"
_LEAD = "300000000000000007"
_BOT = "300000000000000009"
_TZ = "America/New_York"


def _manage(target_id: str, name: str, **kwargs: Any) -> dict[str, Any]:
    return user_command("Raid: Manage", target_id, target_name=name, **kwargs)


def _signup(event: WowRaidEvent | str, player: str, name: str, **kwargs: Any) -> dict[str, Any]:
    raid = event if isinstance(event, str) else str(event.id)
    return command("raid-admin", "signup", event=raid, player=player, resolved=resolved_member(player, name), **kwargs)


async def _more_raids(db: AsyncSession, event: WowRaidEvent, count: int) -> list[WowRaidEvent]:
    """*count* more raids in *event*'s server, a day apart after it."""
    raids = []
    for day in range(1, count + 1):
        raid = await wow_raid_event_repo.create(
            db,
            guild_id=event.guild_id,
            raid_key=event.raid_key,
            starts_at=event.starts_at + timedelta(days=day),
            size_cap=event.size_cap,
            channel_id=event.channel_id,
            created_by_user_id=event.created_by_user_id,
        )
        raids.append(raid)
    return raids


def _options(picker: dict[str, Any]) -> list[dict[str, Any]]:
    return picker["data"]["components"][0]["components"][0]["options"]


async def test_right_click_opens_the_players_card_on_the_one_raid_you_lead(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    card = await post(_manage(_BOB, "Bob"))
    assert card["type"] == 4
    assert_ephemeral(card)
    assert content(card) == raid_line_of(event)
    assert card_embed(card)["author"]["name"] == "Bob"
    assert card_description(card) == raid_manage_copy.not_on_raid("**Bob**")
    assert custom_ids(card) == [ml(event, "class", _BOB), ml(event, "open")]
    assert await signup_row(db, event, _BOB) is None
    assert fake_discord.calls == []

    # --- on yourself: your own card
    mine = await post(_manage(ORGANISER, "Org"))
    assert card_description(mine) == raid_manage_copy.not_on_raid("**Org**")


async def test_with_several_raids_you_pick_the_raid_first(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    second, third = await _more_raids(db, event, 2)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, second, _BOB, "Bob", "warrior.fury", status="absence")

    picker = await post(_manage(_BOB, "Bob"))
    assert_ephemeral(picker)
    assert card_description(picker) == raid_manage_copy.raid_pick_prompt("**Bob**")
    assert card_embed(picker)["author"]["name"] == "Bob"
    assert custom_ids(picker) == ["raid:v1:mr"]
    assert picker["data"]["components"][0]["components"][0]["placeholder"] == raid_manage_copy.PICK_RAID
    assert _options(picker) == [
        {"label": event_choice_label(raid, _TZ), "value": f"{raid.id}:{_BOB}", "description": description}
        for raid, description in (
            (event, "Fury Warrior"),
            (second, raid_manage_copy.MARKED_ABSENT),
            (third, raid_manage_copy.NOT_SIGNED_UP),
        )
    ]

    # --- a pick: the card on that raid, in place of the picker, still headed by the player
    pick = click("raid:v1:mr", user_id=ORGANISER, values=[f"{second.id}:{_BOB}"], message=picker["data"])
    card = await post(pick)
    assert card["type"] == 7
    assert card_embed(card)["author"]["name"] == "Bob"
    assert card_description(card).split("\n") == [
        raid_manage_copy.absent_note("**Bob**"),
        "Add **Bob** to this raid as **Fury Warrior**?",
    ]
    assert ml(second, "open") in custom_ids(card)

    # --- a picker left open after a raid was cancelled
    third.status = "cancelled"
    await db.flush()
    stale = click("raid:v1:mr", user_id=ORGANISER, values=[f"{third.id}:{_BOB}"], message=picker["data"])
    assert content(await post(stale)) == raid_manage_copy.GONE
    garbled = click("raid:v1:mr", user_id=ORGANISER, values=[f"{third.id}:bob"], message=picker["data"])
    assert content(await post(garbled)) == raid_copy.GENERIC_ERROR


async def test_the_picker_lists_the_25_raids_starting_soonest(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    raids = [event, *await _more_raids(db, event, 25)]
    picker = await post(_manage(_BOB, "Bob"))
    values = [option["value"] for option in _options(picker)]
    assert values == [f"{raid.id}:{_BOB}" for raid in raids[:25]]


async def test_a_raids_own_leader_manages_only_the_raids_they_lead(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    (second,) = await _more_raids(db, event, 1)
    second.leader_user_id = _LEAD
    await db.flush()

    card = await post(_manage(_BOB, "Bob", user_id=_LEAD, permissions=0))
    assert content(card) == raid_line_of(second)
    assert ml(second, "open") in custom_ids(card)

    refused = await post(_manage(_BOB, "Bob", user_id=_DI, permissions=0))
    assert content(refused) == raid_copy.NOT_LEADER
    # /raid-admin is for organisers: a raid's own leader uses the right-click.
    slash = await post(_signup(second, _BOB, "Bob", user_id=_LEAD, permissions=0))
    assert content(slash) == raid_copy.NOT_PERMITTED_EVENTS


async def test_who_and_where_a_right_click_cant_manage(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    assert content(await post(_manage(_BOB, "Bob"))) == raid_copy.NOT_CONFIGURED
    await setup_guild(post)
    assert content(await post(_manage(_BOB, "Bob"))) == raid_copy.NO_UPCOMING

    await posted_raid(post, db, fake_discord)
    assert content(await post(_manage(_BOT, "Raid Bot", bot=True))) == raid_copy.LEADER_BOT
    assert content(await post(_manage("bob", "Bob"))) == raid_copy.GENERIC_ERROR
    in_dms = _manage(_BOB, "Bob")
    del in_dms["guild_id"]
    assert content(await post(in_dms)) == raid_copy.GUILD_ONLY
    assert fake_discord.calls == []


async def test_raid_admin_signup_opens_the_players_card(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    card = await post(_signup(event, _BOB, "Bob"))
    assert card["type"] == 4
    assert_ephemeral(card)
    assert card_embed(card)["author"]["name"] == "Bob"
    assert card_description(card) == raid_manage_copy.not_on_raid("**Bob**")

    assert content(await post(_signup("Sat Oct 10 8pm", _BOB, "Bob"))) == raid_copy.NOT_FOUND
    bot = resolved_member(_BOT, "Raid Bot", bot=True)
    assert content(await post(command("raid-admin", "signup", event=str(event.id), player=_BOT, resolved=bot))) == (
        raid_copy.LEADER_BOT
    )
    event.status = "cancelled"
    await db.flush()
    assert content(await post(_signup(event, _BOB, "Bob"))) == raid_manage_copy.GONE
    assert fake_discord.calls == []


async def test_signup_autocomplete_offers_a_raid_that_has_started(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.starts_at = utcnow() - timedelta(minutes=30)
    await db.flush()
    signup = await post(autocomplete("signup", "event", ""))
    assert [choice["value"] for choice in signup["data"]["choices"]] == [str(event.id)]
    edit = await post(autocomplete("edit", "event", ""))
    assert edit["data"]["choices"] == []


def test_raid_manage_is_a_member_right_click_for_organisers() -> None:
    assert USER_COMMANDS == [
        {
            "name": "Raid: Manage",
            "type": 2,
            "dm_permission": False,
            "contexts": [0],
            "default_member_permissions": str(1 << 33),
        }
    ]
    (signup,) = [option for option in RAID_ADMIN_COMMAND["options"] if option["name"] == "signup"]
    assert [(o["name"], o["type"], o.get("required")) for o in signup["options"]] == [
        ("event", 3, True),
        ("player", 6, True),
    ]
