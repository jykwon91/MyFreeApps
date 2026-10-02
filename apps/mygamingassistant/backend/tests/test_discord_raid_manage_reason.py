"""Manage sign-ups' "say why" buttons: a form for the reason, then the change, with the reason in the DM.

[Add and say why] / [Remove and say why] / [Move and say why], through POST
/discord/interactions with the helpers in ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.wow.raid_custom_id import MAX_CUSTOM_ID_LEN, NO_ARG, RaidCustomId, manage, parse

from discord_raid_harness import (
    ORGANISER,
    FakeDiscord,
    Post,
    assert_ephemeral,
    command,
    content,
    custom_ids,
    modal_submit,
)
from discord_raid_manage_harness import (
    POST_LINK,
    RAID_NAME,
    card_description,
    card_lines,
    ml,
    pick,
    posted_raid,
    raid_line_of,
    review_card,
    sign_up,
    signup_row,
    starts_unix,
    tap,
)

_BOB = "300000000000000001"


def _why(event: WowRaidEvent, verb: str, member: str, arg: str, reason: str, *, on: dict[str, Any]) -> dict[str, Any]:
    """The form a "say why" button on the card *on* opened, sent with *reason* (Discord sends the card along)."""
    payload = modal_submit(ml(event, verb, member, arg), {"value": reason})
    payload["message"] = on["data"]
    return payload


def _dm_to_bob(fake_discord: FakeDiscord) -> str:
    """The one DM Bob got: its text (no mention in it pings)."""
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None and dm.body["allowed_mentions"] == {"parse": []}
    return dm.body["content"]


async def test_add_and_say_why_opens_a_form_then_puts_the_reason_above_the_link(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    when = starts_unix(event)
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")

    # --- the form carries the button's own id; nothing changes yet
    form = await post(tap(event, "addr", _BOB, "warrior.fury", on=review))
    assert form["type"] == 9
    assert form["data"]["custom_id"] == ml(event, "addr", _BOB, "warrior.fury")
    assert form["data"]["title"] == "Tell them why"
    [field] = form["data"]["components"]
    assert (field["label"], field["description"]) == ("Reason", "I'll add this to the DM.")
    assert field["component"] == {
        "type": 4, "custom_id": "value", "style": 1, "max_length": 200, "required": True, "min_length": 1
    }
    assert await signup_row(db, event, _BOB) is None
    assert fake_discord.calls == []

    # --- sent: Bob's in, named from the card, and his DM says why
    hub = await post(_why(event, "addr", _BOB, "warrior.fury", "  Need a   tank ", on=review))
    assert hub["type"] == 7
    assert card_lines(hub)[1:3] == ["**Bob** is in as **Fury Warrior**.", raid_manage_copy.DM_SENDING]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and (bob.display_name, bob.status) == ("Bob", "confirmed")
    dm = _dm_to_bob(fake_discord)
    assert dm == raid_manage_copy.added_dm(
        ORGANISER, RAID_NAME, when, "Fury Warrior", None, POST_LINK, signups_open=True, reason="Need a tank"
    )
    assert dm.endswith(f"\nReason: Need a tank\n[Jump to the raid]({POST_LINK})")


async def test_move_and_remove_say_why_and_a_blank_reason_sends_the_plain_dm(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    when = starts_unix(event)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")

    # --- [Move and say why] to the bench
    card = await post(pick(event, _BOB, "Bob"))
    review = await post(tap(event, "mark", _BOB, "bench", on=card))
    form = await post(tap(event, "markr", _BOB, "bench", on=review))
    assert form["data"]["custom_id"] == ml(event, "markr", _BOB, "bench")
    moved = await post(_why(event, "markr", _BOB, "bench", "Full on DPS", on=review))
    assert card_lines(moved)[1:] == [raid_manage_copy.moved("**Bob**", "bench", None), raid_manage_copy.DM_SENDING]
    assert _dm_to_bob(fake_discord) == raid_manage_copy.moved_dm(
        ORGANISER, RAID_NAME, when, "Fury Warrior", "bench", None, POST_LINK, signups_open=True, reason="Full on DPS"
    )

    # --- [Remove and say why]
    fake_discord.clear()
    ask = await post(tap(event, "ask", _BOB, on=moved))
    form = await post(tap(event, "dropr", _BOB, on=ask))
    assert form["data"]["custom_id"] == ml(event, "dropr", _BOB)
    hub = await post(_why(event, "dropr", _BOB, NO_ARG, "No-show  last week", on=ask))
    assert card_lines(hub)[1:3] == ["Removed **Bob**.", raid_manage_copy.DM_SENDING]
    assert await signup_row(db, event, _BOB) is None
    dm = _dm_to_bob(fake_discord)
    assert dm == raid_manage_copy.removed_dm(ORGANISER, RAID_NAME, when, reason="No-show last week")
    assert dm.endswith("Ask them directly.\nReason: No-show last week")

    # --- a box of only spaces: the plain DM
    fake_discord.clear()
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")
    await post(_why(event, "addr", _BOB, "warrior.fury", "   ", on=review))
    assert _dm_to_bob(fake_discord) == raid_manage_copy.added_dm(
        ORGANISER, RAID_NAME, when, "Fury Warrior", None, POST_LINK, signups_open=True
    )


async def test_a_stale_card_or_form_says_why_and_drops_the_reason(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    review = await review_card(post, event, _BOB, "Bob", "warrior.fury")

    # --- Bob signed up himself meanwhile: no form, his card says so
    await sign_up(db, event, _BOB, "Bob", "mage.frost")
    card = await post(tap(event, "addr", _BOB, "warrior.fury", on=review))
    assert card_lines(card) == [raid_line_of(event), raid_manage_copy.already_on("**Bob**")]
    assert card_description(card) == "**Bob** is in as **Frost Mage**."

    # --- benched by someone else while the move's form was open
    move = await post(tap(event, "mark", _BOB, "bench", on=card))
    await post(tap(event, "markr", _BOB, "bench", on=move))
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    bob.status = "bench"
    await db.flush()
    card = await post(_why(event, "markr", _BOB, "bench", "Too many mages", on=move))
    assert card_lines(card)[1] == raid_manage_copy.status_unchanged("**Bob**", "bench", None)
    again = await post(tap(event, "markr", _BOB, "bench", on=move))
    assert card_lines(again)[1] == raid_manage_copy.status_unchanged("**Bob**", "bench", None)

    # --- gone while the removal's form was open
    ask = await post(tap(event, "ask", _BOB, on=card))
    await post(tap(event, "dropr", _BOB, on=ask))
    await wow_raid_signup_repo.delete(db, bob)
    hub = await post(_why(event, "dropr", _BOB, NO_ARG, "No-show", on=ask))
    assert card_lines(hub)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    card = await post(tap(event, "dropr", _BOB, on=ask))
    assert card_lines(card)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    assert fake_discord.calls == []


async def test_no_say_why_for_a_player_with_dms_off_or_the_leader_themself(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, event, ORGANISER, "Thrall", "mage.frost")
    prefs = await post(command("raid", "prefs", user_id=_BOB, permissions=0, dm_reminders=False))
    assert "Saved." in content(prefs)
    for user_id, name in ((_BOB, "Bob"), (ORGANISER, "Thrall")):
        card = await post(pick(event, user_id, name))
        ask = await post(tap(event, "ask", user_id, on=card))
        assert custom_ids(ask) == [ml(event, "dropq", user_id), ml(event, "card", user_id)]
        move = await post(tap(event, "mark", user_id, "bench", on=card))
        assert custom_ids(move) == [ml(event, "markq", user_id, "bench"), ml(event, "card", user_id)]


async def test_on_a_cancelled_raid_neither_the_button_nor_its_form_changes_anything(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    card = await post(pick(event, _BOB, "Bob"))
    ask = await post(tap(event, "ask", _BOB, on=card))
    form = await post(tap(event, "dropr", _BOB, on=ask))
    assert form["type"] == 9

    # --- a form whose id isn't a "say why" one
    response = await post(modal_submit(ml(event, "dropt", _BOB), {"value": "No-show"}))
    assert_ephemeral(response)
    assert content(response) == raid_copy.GENERIC_ERROR

    event.status = "cancelled"
    await db.flush()
    for response in (
        await post(_why(event, "dropr", _BOB, NO_ARG, "No-show", on=ask)),
        await post(tap(event, "dropr", _BOB, on=ask)),
    ):
        assert (response["type"], content(response), custom_ids(response)) == (7, raid_manage_copy.GONE, [])
    assert await signup_row(db, event, _BOB) is not None
    assert fake_discord.calls == []


def test_the_say_why_ids_round_trip_and_fit_at_their_longest() -> None:
    event_id = uuid.UUID("a1b2c3d4-0000-4000-8000-000000000000")
    member = "9" * 20
    for verb, arg in (("addr", "hunter.beast-mastery"), ("dropr", NO_ARG), ("markr", "tentative")):
        assert parse(manage(event_id, verb, member, arg)) == RaidCustomId("ml", event_id, (verb, member, arg))
    assert len(manage(event_id, "addr", member, "hunter.beast-mastery")) == 94 <= MAX_CUSTOM_ID_LEN
    assert parse(manage(event_id, "dropr", member, "warrior.fury")) is None
    assert parse(manage(event_id, "markr", member, "absence")) is None
