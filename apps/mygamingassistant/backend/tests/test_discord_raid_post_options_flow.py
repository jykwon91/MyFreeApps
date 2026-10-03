"""End-to-end flows for Raid: Edit → Advanced's post options, and /raid-admin advanced's pin and voice channel.

Pin the post — at [Post raid], from its card (busy, then how it went) and
from the server's default — with Discord refusing (no Pin Messages, a full
pin list) or never answering; the voice channel on the post; Delete the
post's menu; /raid-admin setup's line while the bot can't pin.  Through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.  The
bot's messages get snowflake-shaped ids (a pin's stamp is checked), so the
raid's post is ``_POST``.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from platform_shared.services.discord import PIN_MESSAGES
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_advanced_repo, wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import raid_advanced_copy, raid_copy, raid_post_options_copy, raid_publisher

from discord_raid_harness import (
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    create_and_post,
    custom_id_for,
    future_when,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_ORGANISER = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS}
# The first message the bot sends: the raid's post.
_POST = "71000000000000001"
_OTHER_POST = "71000000000000008"
_PINS = f"/channels/{CHANNEL}/messages/pins/{_POST}"
_VOICE = "710000000000000009"
_RETRY = "I'll try again the next time the post updates"


@pytest.fixture(autouse=True)
def _snowflakes(fake_discord: FakeDiscord) -> None:
    fake_discord.message_prefix = "7100000000000000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid — its post is ``_POST`` — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    assert event.message_id == _POST
    fake_discord.clear()
    return event


async def _posted(db: AsyncSession, like: WowRaidEvent) -> WowRaidEvent:
    """Another posted raid in the same server (its post ``_OTHER_POST``), the day after *like*."""
    raid = await wow_raid_event_repo.create(
        db, guild_id=like.guild_id, raid_key="onyxia", starts_at=like.starts_at + timedelta(days=1),
        size_cap=5, channel_id=CHANNEL, created_by_user_id=ORGANISER, status="scheduled",
    )
    await wow_raid_event_repo.set_message_id(db, raid, _OTHER_POST)
    return raid


def _adv(event: WowRaidEvent, verb: str, arg: str = "-") -> dict[str, Any]:
    """A button on the raid's Advanced cards, by the organiser."""
    return click(f"raid:v1:adv:{event.id}:{verb}:{arg}", **_ORGANISER)


def _menu(event: WowRaidEvent, verb: str, value: str) -> dict[str, Any]:
    """A pick in one of the raid's Advanced menus (``pick``, ``voice``, ``del``)."""
    return click(f"raid:v1:adv:{event.id}:{verb}:-", values=[value], **_ORGANISER)


def _server(verb: str, arg: str = "-", **as_who: Any) -> dict[str, Any]:
    """A button on /raid-admin advanced's cards — by the organiser unless *as_who* says otherwise."""
    return click(f"raid:v1:sadv:{verb}:{arg}", **{**_ORGANISER, **as_who})


def _server_menu(verb: str, value: str) -> dict[str, Any]:
    return click(f"raid:v1:sadv:{verb}:-", values=[value], **_ORGANISER)


def _notice(response: dict[str, Any]) -> str:
    """The card's last line — what just changed — without its small-text mark."""
    line = content(response).split("\n")[-1]
    assert line.startswith("-# "), line
    return line.removeprefix("-# ")


def _said(fake_discord: FakeDiscord) -> str:
    """The leader's message as the bot last left it (the "Posted" message, the card, setup's reply)."""
    edit = fake_discord.original_edits()[-1]
    assert edit.body is not None
    return edit.body["content"]


def _pins(fake_discord: FakeDiscord) -> list[tuple[str, str]]:
    """Every pin (PUT) and unpin (DELETE) since the last clear: (method, the message)."""
    return [(c.method, c.path.rsplit("/", 1)[-1]) for c in fake_discord.calls if "/messages/pins/" in c.path]


def _post_lines(fake_discord: FakeDiscord) -> list[str]:
    """The raid post as the last re-render left it."""
    edit = fake_discord.public_edits()[-1]
    assert edit.body is not None
    return edit.body["embeds"][0]["description"].split("\n")


async def _guild(db: AsyncSession) -> WowRaidGuild:
    guild = await wow_raid_guild_repo.get_by_discord_id(db, GUILD)
    assert guild is not None
    await db.refresh(guild)
    return guild


def _refuse_pin(fake_discord: FakeDiscord, how: str) -> None:
    """Discord's next answer to the post's pin: no Pin Messages (50013), a full pin list (30003), or none."""
    if how == "no-pin-messages":
        fake_discord.fail("PUT", _PINS, 403, 50013)
    if how == "pin-list-full":
        fake_discord.fail("PUT", _PINS, 400, 30003)
    if how == "no-answer":
        fake_discord.time_out("PUT", _PINS)


# ---------------------------------------------------------------------------
# Pin the post — at [Post raid]
# ---------------------------------------------------------------------------


async def test_a_server_that_pins_raid_posts_pins_each_new_post_once(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    response = await post(_server("on", "pin"))
    assert _notice(response) == raid_post_options_copy.pin_saved(True, server=True)
    assert (await _guild(db)).pin_posts is True

    event = await create_and_post(post, db)
    assert (_pins(fake_discord), event.pinned_message_id) == ([("PUT", _POST)], _POST)
    assert not any(_RETRY in (edit.body or {}).get("content", "") for edit in fake_discord.original_edits())

    # A refresh after: the post is pinned already.
    fake_discord.clear()
    await raid_publisher.refresh_public_message(event.id)
    assert (len(fake_discord.public_edits()), _pins(fake_discord)) == (1, [])


@pytest.mark.parametrize(
    ("how", "said"),
    [
        ("no-pin-messages", f"Not pinned: the bot needs **Pin Messages** in <#{CHANNEL}>; {_RETRY}."),
        ("pin-list-full", f"Not pinned: <#{CHANNEL}> has as many pins as Discord allows; {_RETRY}."),
        ("no-answer", f"Discord didn't pin the post just now; {_RETRY}."),
    ],
)
async def test_a_pin_discord_refuses_at_post_raid_is_said_then_tried_again(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, how: str, said: str
) -> None:
    await setup_guild(post)
    await post(_server("on", "pin"))
    _refuse_pin(fake_discord, how)

    event = await create_and_post(post, db)
    assert (_pins(fake_discord), event.pinned_message_id) == ([("PUT", _POST)], None)
    # The "Posted" message ends with why.
    assert _said(fake_discord).split("\n")[-1] == said

    # The post's next refresh tries again.
    fake_discord.clear()
    await raid_publisher.refresh_public_message(event.id)
    assert _pins(fake_discord) == [("PUT", _POST)]
    await db.refresh(event)
    assert event.pinned_message_id == _POST


async def test_a_drafts_pin_is_saved_then_made_when_the_raid_is_posted(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    fake_discord.clear()

    response = await post(_adv(event, "on", "pin"))
    assert _notice(response) == raid_post_options_copy.pin_saved(True, server=False)
    assert fake_discord.calls == []

    await post(click(custom_id_for(preview, "confirm"), **_ORGANISER))
    assert _pins(fake_discord) == [("PUT", _POST)]
    await db.refresh(event)
    assert (event.status, event.message_id, event.pinned_message_id) == ("scheduled", _POST, _POST)


# ---------------------------------------------------------------------------
# Pin the post — its card
# ---------------------------------------------------------------------------


async def test_the_pin_card_pins_and_unpins_the_post_then_says_how_it_went(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    label = raid_advanced_copy.label(event, await _guild(db))
    response = await post(_menu(event, "pick", "pin"))
    assert content(response).split("\n")[0] == f"Pin the post for **{label}**?"

    response = await post(_adv(event, "on", "pin"))
    assert (response["type"], _notice(response)) == (7, "Pinning the post…")
    assert all(button.get("disabled") for row in response["data"]["components"] for button in row["components"])
    assert _pins(fake_discord) == [("PUT", _POST)]
    assert _said(fake_discord).split("\n")[-1] == "-# Saved: this raid's post is pinned until the raid starts."
    await db.refresh(event)
    assert (event.pin_post, event.pinned_message_id) == (True, _POST)

    fake_discord.clear()
    response = await post(_adv(event, "off", "pin"))
    assert _notice(response) == "Unpinning the post…"
    assert _pins(fake_discord) == [("DELETE", _POST)]
    assert _said(fake_discord).split("\n")[-1] == "-# Saved: this raid's post isn't pinned."
    await db.refresh(event)
    assert (event.pin_post, event.pinned_message_id) == (False, None)

    # Back to the server's default (off): nothing on Discord to change.
    fake_discord.clear()
    response = await post(_adv(event, "inherit", "pin"))
    assert _notice(response) == raid_advanced_copy.INHERIT_NOTICE
    assert "Pin the post: **off** (server default)" in content(response).split("\n")
    assert fake_discord.calls == []
    await db.refresh(event)
    assert event.pin_post is None


async def test_the_pin_card_says_why_discord_refused_the_pin(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.fail("PUT", _PINS, 403, 50013)
    await post(_adv(event, "on", "pin"))
    assert _said(fake_discord).split("\n")[-1] == (
        f"-# Saved, but the post isn't pinned: the bot needs **Pin Messages** in <#{CHANNEL}>; {_RETRY}."
    )
    await db.refresh(event)
    assert (event.pin_post, event.pinned_message_id) == (True, None)


# ---------------------------------------------------------------------------
# Pin the post — the server's default
# ---------------------------------------------------------------------------


async def test_the_servers_pin_reaches_only_the_raids_that_follow_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    following = await _raid(post, db, fake_discord)
    own = await _posted(db, following)
    await wow_raid_advanced_repo.set_pin_post(db, own, False)

    # Manage Events, checked again on every tap.
    response = await post(_server("on", "pin", user_id="401", permissions=0))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_PERMITTED_EVENTS)
    assert fake_discord.calls == []

    response = await post(_server_menu("pick", "pin"))
    assert content(response).split("\n")[0] == raid_post_options_copy.SERVER_PIN_PROMPT
    response = await post(_server("on", "pin"))
    assert _notice(response) == raid_post_options_copy.pin_saved(True, server=True)
    assert _pins(fake_discord) == [("PUT", _POST)]
    await db.refresh(following)
    assert following.pinned_message_id == _POST

    fake_discord.clear()
    response = await post(_server("off", "pin"))
    assert _notice(response) == raid_post_options_copy.pin_saved(False, server=True)
    assert _pins(fake_discord) == [("DELETE", _POST)]
    await db.refresh(following)
    assert following.pinned_message_id is None


async def test_setup_says_while_the_bot_cant_pin_the_raid_posts(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    assert _said(fake_discord).split("\n")[1:] == []

    await post(_server("on", "pin"))
    await setup_guild(post)
    assert _said(fake_discord).split("\n")[1:] == [raid_post_options_copy.setup_no_pins(CHANNEL)]

    fake_discord.bot_channel_permissions |= PIN_MESSAGES
    await setup_guild(post)
    assert _said(fake_discord).split("\n")[1:] == []


# ---------------------------------------------------------------------------
# Voice channel
# ---------------------------------------------------------------------------


async def test_the_raids_voice_channel_shows_on_its_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(_menu(event, "pick", "voice"))
    assert content(response).split("\n")[1] == "Voice channel: none (server default)"

    response = await post(_menu(event, "voice", _VOICE))
    assert _notice(response) == f"Saved: the post shows <#{_VOICE}>."
    assert f"Voice: <#{_VOICE}>" in _post_lines(fake_discord)
    await db.refresh(event)
    assert event.voice_channel_id == _VOICE

    fake_discord.clear()
    response = await post(_adv(event, "off", "voice"))
    assert _notice(response) == "Saved: no voice channel on this raid's post."
    assert not any(line.startswith("Voice:") for line in _post_lines(fake_discord))
    await db.refresh(event)
    assert event.voice_channel_id == "0"

    # A pick the menu never offers (an old card).
    fake_discord.clear()
    response = await post(_menu(event, "voice", "general"))
    assert (response["type"], content(response)) == (7, raid_copy.GENERIC_ERROR)
    assert fake_discord.calls == []


async def test_the_servers_voice_channel_reaches_the_raids_that_follow_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    following = await _raid(post, db, fake_discord)
    own = await _posted(db, following)
    await wow_raid_advanced_repo.set_voice_channel(db, own, "0")

    response = await post(_server_menu("voice", _VOICE))
    assert _notice(response) == f"Saved: raid posts show <#{_VOICE}>, unless a raid sets its own."
    assert [edit.path for edit in fake_discord.public_edits()] == [f"/channels/{CHANNEL}/messages/{_POST}"]
    assert f"Voice: <#{_VOICE}>" in _post_lines(fake_discord)
    assert (await _guild(db)).voice_channel_id == _VOICE

    # A raid that had its own follows the server again.
    fake_discord.clear()
    response = await post(_adv(own, "inherit", "voice"))
    assert _notice(response) == raid_advanced_copy.INHERIT_NOTICE
    assert [edit.path for edit in fake_discord.public_edits()] == [f"/channels/{CHANNEL}/messages/{_OTHER_POST}"]
    assert f"Voice: <#{_VOICE}>" in _post_lines(fake_discord)

    fake_discord.clear()
    response = await post(_server("off", "voice"))
    assert _notice(response) == "Saved: raid posts show no voice channel, unless a raid sets its own."
    assert len(fake_discord.public_edits()) == 2
    assert (await _guild(db)).voice_channel_id is None


# ---------------------------------------------------------------------------
# Delete the post
# ---------------------------------------------------------------------------


async def test_delete_the_post_saves_the_delay_without_a_call_to_discord(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    label = raid_advanced_copy.label(event, await _guild(db))
    response = await post(_menu(event, "pick", "del"))
    assert content(response).split("\n")[0] == f"Delete the post for **{label}** after the raid?"

    response = await post(_menu(event, "del", "24"))
    assert _notice(response) == "Saved: the post is deleted 1 day after the raid ends."
    assert "Delete the post: **1 day** after the raid" in content(response).split("\n")
    await db.refresh(event)
    assert event.delete_post_after_hours == 24

    response = await post(_menu(event, "del", "keep"))
    assert _notice(response) == "Saved: the post stays up after the raid."
    await db.refresh(event)
    assert event.delete_post_after_hours is None

    response = await post(_menu(event, "del", "5"))
    assert (response["type"], content(response)) == (7, raid_copy.GENERIC_ERROR)
    assert fake_discord.calls == []
