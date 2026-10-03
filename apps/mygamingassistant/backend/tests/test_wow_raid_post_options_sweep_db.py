"""A raid post's pin through the raid's turns, and the post deleted after the raid — against real Postgres.

The start and a cancel undo the bot's own pin (never a member's); a repost
after a member deleted the post pins the new one.  The delete sweep takes a
finished raid's post down once its delay after the end has passed — stamped
first, then the DELETE, never twice: a post already gone counts, a refusal
isn't tried again, and the raid itself stays.  Discord REST is the
harness's ``FakeDiscord``; every test runs inside the SAVEPOINT-bound
session (``bound_unit_of_work``).

Every timestamp is in 2001, so no real row in the shared local test database
is ever due.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_advanced_repo, wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import raid_publisher
from app.services.wow import raid_event_service
from app.services.wow.raid_extras_rules import DEFAULT_LENGTH
from app.services.wow.raid_notification_worker import process_due_notifications

from discord_raid_harness import CHANNEL, FakeDiscord

_NOW = datetime(2001, 3, 1, 12, 0, tzinfo=timezone.utc)
_GUILD = "5179"
_POST = "71000000000000101"
_POST_PATH = f"/channels/{CHANNEL}/messages/{_POST}"
_LEADER = "41"


@pytest.fixture(autouse=True)
def _discord_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)


async def _raid(
    db: AsyncSession,
    *,
    starts_at: datetime,
    status: str = "scheduled",
    pin: bool | None = None,
    pinned: bool = False,
    delete_after: int | None = None,
) -> WowRaidEvent:
    """A posted raid (its post ``_POST``): its own pin setting, the bot's pin when *pinned*, its delete delay."""
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=_GUILD, raid_channel_id=CHANNEL)
    event = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key="onyxia", starts_at=starts_at, size_cap=10,
        channel_id=CHANNEL, created_by_user_id=_LEADER, status=status,
    )
    await wow_raid_event_repo.set_message_id(db, event, _POST)
    await wow_raid_advanced_repo.set_pin_post(db, event, pin)
    if pinned:
        await wow_raid_advanced_repo.set_pinned_message(db, event, _POST)
    await wow_raid_advanced_repo.set_delete_after(db, event, delete_after)
    return event


def _pins(fake_discord: FakeDiscord) -> list[tuple[str, str]]:
    """Every pin (PUT) and unpin (DELETE): (method, the message)."""
    return [(c.method, c.path.rsplit("/", 1)[-1]) for c in fake_discord.calls if "/messages/pins/" in c.path]


def _post_calls(fake_discord: FakeDiscord) -> list[tuple[str, str]]:
    """Every call on a message in the raid channel, in order: (method, path)."""
    return [(c.method, c.path) for c in fake_discord.calls if c.path.startswith(f"/channels/{CHANNEL}/messages/")]


# ---------------------------------------------------------------------------
# The pin through the raid's turns
# ---------------------------------------------------------------------------


async def test_the_start_unpins_the_bots_pin_once(bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(minutes=5), pin=True, pinned=True)

    stats = await process_due_notifications(now=_NOW)
    assert stats.started == 1
    assert _pins(fake_discord) == [("DELETE", _POST)]
    await db.refresh(event)
    assert (event.start_applied_at, event.pinned_message_id) == (_NOW, None)

    fake_discord.clear()
    await process_due_notifications(now=_NOW + timedelta(minutes=1))
    assert _pins(fake_discord) == []


async def test_a_pin_the_bot_didnt_make_stays_at_the_start(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    # Pin the post is on, but the bot's pin never went through: a member pinned the post.
    await _raid(db, starts_at=_NOW - timedelta(minutes=5), pin=True)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.started, len(fake_discord.public_edits())) == (1, 1)
    assert _pins(fake_discord) == []


async def test_a_cancel_unpins_the_bots_pin(bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(days=1), pin=True, pinned=True)
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    assert guild is not None

    dm_ids = await raid_event_service.cancel_event(db, event=event, guild=guild)
    await raid_publisher.announce_cancellation(event.id, dm_ids)
    assert _pins(fake_discord) == [("DELETE", _POST)]
    await db.refresh(event)
    assert (event.status, event.pinned_message_id) == ("cancelled", None)


async def test_a_repost_after_the_post_was_deleted_pins_the_new_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    fake_discord.message_prefix = "7100000000000000"
    event = await _raid(db, starts_at=_NOW + timedelta(days=1), pin=True, pinned=True)
    # A member deleted the post: its pin went with it.
    fake_discord.fail("PATCH", _POST_PATH, 404, 10008)

    await raid_publisher.refresh_public_message(event.id)
    await db.refresh(event)
    assert (event.message_id, event.pinned_message_id) == ("71000000000000001", "71000000000000001")
    assert _pins(fake_discord) == [("PUT", "71000000000000001")]


# ---------------------------------------------------------------------------
# Delete the post after the raid
# ---------------------------------------------------------------------------


async def test_a_finished_raids_post_is_deleted_once_its_delay_has_passed(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    due = _NOW + timedelta(minutes=1)
    # The raid ends DEFAULT_LENGTH minutes after its start; the post goes 3 hours after that.
    starts_at = due - timedelta(minutes=DEFAULT_LENGTH, hours=3)
    event = await _raid(db, starts_at=starts_at, status="completed", delete_after=3)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.posts_deleted, fake_discord.find("DELETE", _POST_PATH)) == (0, [])

    stats = await process_due_notifications(now=due)
    assert stats.posts_deleted == 1
    assert len(fake_discord.find("DELETE", _POST_PATH)) == 1
    await db.refresh(event)
    assert (event.post_deleted_at, event.message_id, event.status) == (due, None, "completed")

    # Deleted once: the next tick does nothing.
    fake_discord.clear()
    stats = await process_due_notifications(now=due + timedelta(hours=1))
    assert (stats.posts_deleted, fake_discord.calls) == (0, [])


async def test_the_tick_that_completes_a_raid_unpins_then_deletes_its_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    # Seven hours since the start: one tick starts the raid, completes it, then deletes its post.
    event = await _raid(db, starts_at=_NOW - timedelta(hours=7), pin=True, pinned=True, delete_after=3)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.started, stats.posts_deleted) == (1, 1)
    assert _post_calls(fake_discord) == [
        ("PATCH", _POST_PATH),
        ("DELETE", f"/channels/{CHANNEL}/messages/pins/{_POST}"),
        ("DELETE", _POST_PATH),
    ]
    await db.refresh(event)
    assert (event.status, event.message_id, event.pinned_message_id) == ("completed", None, None)
    assert event.post_deleted_at == _NOW


async def test_a_cancelled_raids_post_already_gone_counts_as_deleted(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(days=2), status="cancelled", delete_after=24)
    fake_discord.fail("DELETE", _POST_PATH, 404, 10008)

    stats = await process_due_notifications(now=_NOW)
    assert stats.posts_deleted == 1
    await db.refresh(event)
    assert (event.post_deleted_at, event.message_id, event.status) == (_NOW, None, "cancelled")


async def test_a_raid_without_a_delay_keeps_its_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(days=2), status="completed")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.posts_deleted, fake_discord.find("DELETE", _POST_PATH)) == (0, [])
    await db.refresh(event)
    assert (event.message_id, event.post_deleted_at) == (_POST, None)


async def test_a_delete_discord_refuses_isnt_tried_again(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(days=2), status="completed", delete_after=6)
    fake_discord.fail("DELETE", _POST_PATH, 403, 50013)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.posts_deleted, len(fake_discord.find("DELETE", _POST_PATH))) == (0, 1)
    await db.refresh(event)
    assert (event.post_deleted_at, event.message_id) == (_NOW, None)

    fake_discord.clear()
    await process_due_notifications(now=_NOW + timedelta(hours=1))
    assert fake_discord.calls == []
