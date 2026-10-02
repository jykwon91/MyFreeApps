"""End-to-end flows for the raid post's right-click menu and the leader's ping.

Raid: Close / Raid: Open / Raid: Signed (message commands), the buttons on
their cards and the ping form's submit, through POST /discord/interactions
with the harness in ``discord_raid_harness.py``.  Sign-ups are written
straight to the repository: the sign-up buttons have their own flows.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_ping
from app.services.discord.commands_spec import CLOSE_MENU, OPEN_MENU, SIGNED_MENU
from app.services.discord.raid_notifications import build_ping
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN

from discord_raid_harness import (
    APP_ID,
    CHANNEL,
    ORGANISER,
    ORGANISER_PERMS,
    TOKEN,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    content,
    create_and_post,
    custom_ids,
    menu_command,
    modal_submit,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_POSTS = f"/channels/{CHANNEL}/messages"


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    assert event.message_id == "m1"
    fake_discord.clear()
    return event


async def _sign_up(db: AsyncSession, event: WowRaidEvent, user_id: str, status: str = "confirmed") -> None:
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        display_name=f"Player{user_id}",
        status=status,
        wow_class="mage",
        role="dps",
        spec="frost",
    )


def _raid_line(event: WowRaidEvent) -> str:
    return f"**Onyxia's Lair** · <t:{int(event.starts_at.timestamp())}:F>"


def _enabled(message: dict[str, Any]) -> list[str]:
    """The raid post's buttons that still work."""
    return [c["custom_id"] for row in message["components"] for c in row["components"] if not c["disabled"]]


def _lead(event: WowRaidEvent, action: str, **as_who: Any) -> dict[str, Any]:
    """A click on a leader card's button — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:lc:{event.id}:{action}", **as_who)


def _ping(event: WowRaidEvent, message: str, **as_who: Any) -> dict[str, Any]:
    """The ping form's submit."""
    return modal_submit(f"raid:v1:m:{event.id}:ping", {"message": message}, **as_who)


def _job(user_ids: list[str]) -> raid_ping.PingJob:
    """A ping to hand ``send_ping`` directly (its raid isn't in the database)."""
    return raid_ping.PingJob(
        event_id=uuid.uuid4(),
        channel_id=CHANNEL,
        post_id="m1",
        messages=build_ping("Raid time", "-# small print", user_ids),
        application_id=APP_ID,
        token=TOKEN,
        claimed_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Raid: Close / Raid: Open
# ---------------------------------------------------------------------------


async def test_close_then_reopen_sign_ups(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "301")

    # --- Raid: Close → a private card offering the opposite; the post greys out
    response = await post(menu_command(CLOSE_MENU, "m1"))
    assert_ephemeral(response)
    assert content(response) == f"{_raid_line(event)}\n{raid_copy.CLOSED_OK}"
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:reopen"]
    await db.refresh(event)
    assert event.closed_at is not None
    assert event.status == "scheduled"
    (edit,) = fake_discord.public_edits()
    assert edit.path == f"{_POSTS}/m1"
    assert edit.body is not None
    [embed] = edit.body["embeds"]
    assert embed["color"] == COLOR_CLOSED
    assert embed["footer"]["text"] == f"ID {str(event.id)[:6]} · Sign-ups are closed."
    assert _enabled(edit.body) == [f"raid:v1:mine:{event.id}"]

    # --- closing again changes nothing and says so, but re-renders the post
    #     (so a post that missed an update catches up)
    fake_discord.clear()
    response = await post(menu_command(CLOSE_MENU, "m1"))
    assert content(response) == f"{_raid_line(event)}\n{raid_copy.ALREADY_CLOSED}"
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    assert edit.body["embeds"][0]["color"] == COLOR_CLOSED

    # --- the post's buttons refuse; [My sign-up] still shows where you stand
    for custom_id in (f"raid:v1:cls:{event.id}:mage", f"raid:v1:status:{event.id}:tentative"):
        response = await post(click(custom_id, user_id="302"))
        assert_ephemeral(response)
        assert content(response) == raid_copy.CLOSED
    assert await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id="302") is None
    response = await post(click(f"raid:v1:mine:{event.id}", user_id="301"))
    assert_ephemeral(response)
    assert content(response).split("\n")[-1] == raid_copy.CLOSED
    assert custom_ids(response) == [f"raid:v1:card:{event.id}:roster"]

    # --- [Reopen sign-ups] on the card flips it back, in place
    fake_discord.clear()
    response = await post(_lead(event, "reopen"))
    assert response["type"] == 7
    assert content(response) == f"{_raid_line(event)}\n{raid_copy.OPENED_OK}"
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:close"]
    await db.refresh(event)
    assert event.closed_at is None
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    assert edit.body["embeds"][0]["color"] == COLOR_OPEN
    assert f"raid:v1:cls:{event.id}:mage" in _enabled(edit.body)

    # --- Raid: Open on an open raid says so; the class buttons work again
    fake_discord.clear()
    response = await post(menu_command(OPEN_MENU, "m1"))
    assert content(response) == f"{_raid_line(event)}\n{raid_copy.ALREADY_OPEN}"
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    assert edit.body["embeds"][0]["color"] == COLOR_OPEN
    response = await post(click(f"raid:v1:cls:{event.id}:mage", user_id="302"))
    assert content(response) == raid_copy.spec_prompt("Mage")


async def test_only_the_leader_or_manage_events_may_lead(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "401")
    member = {"user_id": "401", "permissions": 0}

    # --- a member who neither created the raid nor has Manage Events
    for name in (CLOSE_MENU, OPEN_MENU, SIGNED_MENU):
        response = await post(menu_command(name, "m1", **member))
        assert_ephemeral(response)
        assert content(response) == raid_copy.NOT_LEADER
    for action in ("close", "reopen", "ping"):
        response = await post(_lead(event, action, **member))
        assert response["type"] == 7
        assert content(response) == raid_copy.NOT_LEADER
        assert custom_ids(response) == []
    response = await post(_ping(event, "Be online", **member))
    assert response["type"] == 7
    assert content(response) == raid_copy.NOT_LEADER
    await db.refresh(event)
    assert event.closed_at is None and event.last_pinged_at is None
    assert fake_discord.calls == []

    # --- Manage Events is enough without having created it
    response = await post(menu_command(CLOSE_MENU, "m1", user_id="402", permissions=MANAGE_EVENTS))
    assert content(response).endswith(raid_copy.CLOSED_OK)

    # --- and whoever created it may, without Manage Events
    response = await post(_lead(event, "reopen", permissions=0))
    assert content(response).endswith(raid_copy.OPENED_OK)


async def test_the_menu_only_works_on_this_servers_raid_posts(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    # --- before /raid-admin setup nothing is a raid post
    response = await post(menu_command(SIGNED_MENU, "m1"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_A_RAID

    event = await _raid(post, db, fake_discord)

    # --- any other message in the server
    response = await post(menu_command(CLOSE_MENU, "m999"))
    assert content(response) == raid_copy.NOT_A_RAID

    # --- the same message id from another server
    elsewhere = menu_command(CLOSE_MENU, "m1")
    elsewhere["guild_id"] = "800000000000000002"
    response = await post(elsewhere)
    assert content(response) == raid_copy.NOT_A_RAID

    # --- from a DM
    in_dm = menu_command(CLOSE_MENU, "m1")
    del in_dm["guild_id"]
    in_dm["user"] = in_dm.pop("member")["user"]
    response = await post(in_dm)
    assert content(response) == raid_copy.GUILD_ONLY

    await db.refresh(event)
    assert event.closed_at is None
    assert fake_discord.public_edits() == []


async def test_a_started_or_cancelled_raid_keeps_its_sign_ups_as_they_are(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()

    response = await post(menu_command(CLOSE_MENU, "m1"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.RAID_STARTED
    assert custom_ids(response) == []
    response = await post(_lead(event, "close"))
    assert response["type"] == 7
    assert content(response) == raid_copy.RAID_STARTED
    assert custom_ids(response) == []  # the card loses its button

    event.status = "cancelled"
    await db.flush()
    response = await post(menu_command(OPEN_MENU, "m1"))
    assert content(response) == raid_copy.ALREADY_CANCELLED
    response = await post(_lead(event, "reopen"))
    assert content(response) == raid_copy.NOT_FOUND

    await db.refresh(event)
    assert event.closed_at is None
    assert fake_discord.public_edits() == []


# ---------------------------------------------------------------------------
# Raid: Signed → [Ping signed members]
# ---------------------------------------------------------------------------


async def test_signed_lists_the_raid_and_pings_everyone_on_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    for user_id, status in (("501", "confirmed"), ("502", "late"), ("503", "tentative"), ("504", "bench")):
        await _sign_up(db, event, user_id, status)
    await _sign_up(db, event, "505", "absence")

    # --- Raid: Signed → everyone on the raid, with [Ping signed members]
    response = await post(menu_command(SIGNED_MENU, "m1"))
    assert_ephemeral(response)
    [embed] = response["data"]["embeds"]
    assert embed["title"] == "Signed up (2/5)"
    for user_id in ("501", "502", "503", "504", "505"):
        assert f"Player{user_id}" in embed["description"]
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:ping"]

    # --- the button opens the form
    response = await post(_lead(event, "ping"))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:ping"

    # --- its submit pings everyone listed but the absence, in a reply to the post
    response = await post(_ping(event, "  Be online at 7  "))
    assert response["type"] == 7
    assert content(response) == raid_copy.pinging(4)
    assert response["data"]["components"] == [] and response["data"]["embeds"] == []
    (ping,) = fake_discord.channel_posts()
    signature = f"-# Onyxia's Lair · <t:{int(event.starts_at.timestamp())}:F> · sent by Thrall"
    assert ping.body == {
        "content": f"Be online at 7\n<@501> <@502> <@503> <@504>\n{signature}",
        "allowed_mentions": {"parse": [], "users": ["501", "502", "503", "504"], "replied_user": False},
        "message_reference": {"message_id": "m1", "fail_if_not_exists": False},
    }
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_sent(4)
    await db.refresh(event)
    assert event.last_pinged_at is not None

    # --- straight away again: the list, saying to wait; a form left open sends nothing
    fake_discord.clear()
    response = await post(_lead(event, "ping"))
    assert response["type"] == 7
    assert content(response) == raid_copy.PING_WAIT
    assert response["data"]["embeds"][0]["title"] == "Signed up (2/5)"
    response = await post(_ping(event, "Again"))
    assert response["type"] == 7
    assert content(response) == raid_copy.PING_WAIT
    assert fake_discord.channel_posts() == []


async def test_without_read_message_history_the_ping_is_not_a_reply(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "601")
    fake_discord.fail("POST", _POSTS, 403, 160002)

    response = await post(_ping(event, "Summons in 10"))
    assert content(response) == raid_copy.pinging(1)
    reply, plain = fake_discord.channel_posts()
    assert reply.body is not None and plain.body is not None
    assert reply.body["message_reference"]["message_id"] == "m1"
    assert "message_reference" not in plain.body
    assert plain.body["content"] == reply.body["content"]
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_sent(1)


async def test_a_refused_ping_hands_its_slot_back(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "701")
    fake_discord.fail("POST", _POSTS, 403, 50013)

    response = await post(_ping(event, "Summons"))
    assert content(response) == raid_copy.pinging(1)
    assert len(fake_discord.channel_posts()) == 1
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_refused(CHANNEL, 50013)
    await db.refresh(event)
    assert event.last_pinged_at is None

    # --- nobody was pinged, so the leader can try again at once
    response = await post(_lead(event, "ping"))
    assert response["type"] == 9


@pytest.mark.parametrize("no_answer", ["timeout", "server error"])
async def test_a_ping_discord_never_confirmed_keeps_its_slot(
    no_answer: str, post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "711")
    if no_answer == "timeout":
        fake_discord.time_out("POST", _POSTS)
    else:
        fake_discord.fail("POST", _POSTS, 503, 0)

    response = await post(_ping(event, "Summons"))
    assert content(response) == raid_copy.pinging(1)
    assert len(fake_discord.channel_posts()) == 1
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_unconfirmed(CHANNEL)

    # --- it may have gone out, so the slot stays taken rather than risk pinging twice
    await db.refresh(event)
    assert event.last_pinged_at is not None
    response = await post(_lead(event, "ping"))
    assert content(response) == raid_copy.PING_WAIT


async def test_a_ping_that_breaks_still_answers_the_leader(
    fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken(*_: Any) -> None:
        raise RuntimeError("a bug")

    monkeypatch.setattr(raid_ping, "_post_ping", broken)
    await raid_ping.send_ping(_job(["1001"]))

    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_unconfirmed(CHANNEL)


async def test_a_ping_cut_short_says_how_many_it_reached(fake_discord: FakeDiscord) -> None:
    job = _job([str(1000 + i) for i in range(150)])
    assert len(job.messages) == 2
    fake_discord.errors[("POST", _POSTS)] = [(200, {"id": "m9"}), (403, {"code": 50013, "message": "nope"})]

    await raid_ping.send_ping(job)

    first, second = fake_discord.channel_posts()
    assert first.body is not None and second.body is not None
    assert first.body["message_reference"] == {"message_id": "m1", "fail_if_not_exists": False}
    assert "message_reference" not in second.body  # only the first replies to the post
    reached = len(first.body["allowed_mentions"]["users"])
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_partly_sent(reached, 150)


async def test_nobody_to_ping_or_nothing_to_say_shows_the_list_again(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "801", "absence")

    # --- only an absence: no ping button, and an old one or an open form says why
    response = await post(menu_command(SIGNED_MENU, "m1"))
    assert custom_ids(response) == []
    response = await post(_lead(event, "ping"))
    assert response["type"] == 7
    assert content(response) == raid_copy.PING_NOBODY
    response = await post(_ping(event, "Anyone?"))
    assert content(response) == raid_copy.PING_NOBODY

    # --- a blank message
    await _sign_up(db, event, "802")
    response = await post(_ping(event, "   "))
    assert response["type"] == 7
    assert content(response) == raid_copy.PING_EMPTY
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:ping"]

    await db.refresh(event)
    assert event.last_pinged_at is None
    assert fake_discord.channel_posts() == []
