"""Repeating raids — the notification worker's step 5, against real Postgres.

Discord REST is the harness's ``FakeDiscord`` (the ``fake_discord`` fixture).
Each worker transaction is a SAVEPOINT on the test's session (``_tick``),
so a refused or failed post rolls back as it would for real; the two-worker
test commits for real on separate connections and cleans up after itself.

Every timestamp is in 2001, so no real row in the shared local test database
is ever due.  New York is on EST until the clocks spring forward on Sunday
1 April 2001.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MISSING_PERMISSIONS, UNKNOWN_CHANNEL
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.models.wow.wow_raid_series import WowRaidSeries
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_series_repo,
    wow_raid_signup_repo,
)
from app.services.discord import raid_publisher, raid_repeat_copy, raid_repeat_publisher
from app.services.wow import raid_repeat
from app.services.wow.raid_notification_outcomes import RunStats
from app.services.wow.raid_notification_worker import process_due_notifications
from app.services.wow.raid_text import title_text

from discord_raid_harness import CHANNEL, NY, FakeDiscord

_TZ = "America/New_York"
_NOW = datetime(2001, 2, 14, 12, 0, tzinfo=timezone.utc)  # Wednesday 14 February, 7:00am in New York
_GUILD = "5170"
_POST = "9101"
_CREATOR = "41"
_POSTS = f"/channels/{CHANNEL}/messages"


@pytest.fixture(autouse=True)
def _discord_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)


def _slot(month: int, day: int, hour: int = 20) -> datetime:
    """*hour*:00 in New York on that day of 2001."""
    return datetime(2001, month, day, hour, 0, tzinfo=NY)


async def _repeat(
    db: AsyncSession,
    *,
    every_days: int = 7,
    next_starts_at: datetime = _slot(2, 20),
    ahead: int | None = None,
    raid_at: datetime = _slot(2, 13),
    guild_discord_id: str = _GUILD,
    message_id: str = _POST,
) -> tuple[WowRaidSeries, WowRaidEvent]:
    """A repeat ``_CREATOR`` made and the raid in it — at *raid_at*, posted as *message_id* — it copies."""
    guild = await wow_raid_guild_repo.upsert_config(
        db, discord_guild_id=guild_discord_id, raid_channel_id=CHANNEL, timezone=_TZ
    )
    raid = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key="onyxia", starts_at=raid_at, size_cap=10,
        channel_id=CHANNEL, created_by_user_id=_CREATOR, status="scheduled",
    )
    await wow_raid_event_repo.set_message_id(db, raid, message_id)
    series = await wow_raid_series_repo.create(
        db,
        guild_id=guild.id,
        every_days=every_days,
        next_starts_at=next_starts_at,
        start_local=raid_repeat.local_clock(next_starts_at, _TZ),
        tz_name=_TZ,
        created_by_user_id=_CREATOR,
    )
    await wow_raid_series_repo.set_cadence(
        db, series, every_days=every_days, post_ahead_hours=ahead, next_starts_at=next_starts_at
    )
    await wow_raid_event_repo.set_series(db, raid, series.id)
    return series, raid


async def _tick(db: AsyncSession, now: datetime = _NOW) -> RunStats:
    """One worker run; each of its transactions is a SAVEPOINT on the test's session, rolled back on an exception."""

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with db.begin_nested():
            yield db

    return await process_due_notifications(now=now, session_scope=scope)


async def _raids(db: AsyncSession, guild_id: uuid.UUID) -> list[WowRaidEvent]:
    """The server's raids, soonest first."""
    result = await db.execute(
        select(WowRaidEvent).where(WowRaidEvent.guild_id == guild_id).order_by(WowRaidEvent.starts_at)
    )
    return list(result.scalars())


def _dm(link_raid: WowRaidEvent, reason: str) -> dict[str, Any]:
    """The DM to the repeat's creator when it stopped."""
    link = raid_publisher.event_link(_GUILD, link_raid)
    return {
        "content": raid_repeat_copy.stopped_dm(title_text(link_raid), reason, link),
        "allowed_mentions": {"parse": []},
    }


# ---------------------------------------------------------------------------
# Posting
# ---------------------------------------------------------------------------


async def test_a_due_repeat_posts_its_next_raid_once_with_the_latest_raids_settings(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    series, raid = await _repeat(db)
    # Edits to the latest raid carry to the next one; its sign-ups don't.
    raid.title = "Ony speedrun"
    raid.role_limits = {"tank": 1}
    raid.class_limits = {"mage": 2}
    raid.signup_notes_enabled = True
    await db.flush()
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=raid.id, discord_user_id="501", display_name="Player501", status="confirmed",
        wow_class="mage", role="dps", spec="frost",
    )

    stats = await _tick(db)
    assert (stats.repeats_posted, stats.repeats_stopped) == (1, 0)
    (posted,) = fake_discord.channel_posts()
    assert posted.body is not None
    _, new = await _raids(db, series.guild_id)
    assert (new.starts_at, new.status, new.series_id, new.channel_id, new.message_id) == (
        _slot(2, 20), "scheduled", series.id, CHANNEL, "m1"
    )
    for name in wow_raid_event_repo.COPIED:
        assert getattr(new, name) == getattr(raid, name), name
    assert (new.created_by_user_id, new.closed_at) == (_CREATOR, None)
    signups = await db.scalar(select(func.count()).where(WowRaidSignup.event_id == new.id))
    assert signups == 0
    # Its reminders, scheduled as [Post raid] schedules them.
    reminders = await db.scalar(select(func.count()).where(WowRaidNotification.event_id == new.id))
    assert reminders > 0
    guild = await wow_raid_guild_repo.get(db, series.guild_id)
    assert guild is not None
    again = await wow_raid_notification_repo.schedule_for_event(
        db, event_id=new.id, starts_at=new.starts_at, guild_settings=guild.settings, now=_NOW
    )
    assert again == 0
    await db.refresh(series)
    assert series.next_starts_at == _slot(2, 27)

    # The next tick, in the same second, posts nothing: the next raid posts when this one starts.
    fake_discord.clear()
    stats = await _tick(db)
    assert stats.repeats_posted == 0
    assert fake_discord.channel_posts() == []


async def test_after_downtime_the_missed_raids_are_skipped_and_the_next_one_posts(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    # Its next raid was 23 January: the 23rd, the 30th, 6 and 13 February have passed.
    series, raid = await _repeat(db, next_starts_at=_slot(1, 23), raid_at=_slot(1, 16))

    stats = await _tick(db)
    assert stats.repeats_posted == 1
    assert len(fake_discord.channel_posts()) == 1
    assert [r.starts_at for r in await _raids(db, series.guild_id)] == [_slot(1, 16), _slot(2, 20)]
    await db.refresh(series)
    assert series.next_starts_at == _slot(2, 27)


async def test_after_downtime_a_next_raid_not_due_yet_waits(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    # Posted a day ahead: the 20 February raid posts on the 19th.
    series, raid = await _repeat(db, next_starts_at=_slot(1, 23), ahead=24, raid_at=_slot(1, 16))

    stats = await _tick(db)
    assert stats.repeats_posted == 0
    assert fake_discord.channel_posts() == []
    assert await _raids(db, series.guild_id) == [raid]
    await db.refresh(series)
    assert series.next_starts_at == _slot(2, 20)


async def test_a_repeat_whose_raids_were_all_deleted_ends_without_a_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    series, raid = await _repeat(db)
    series_id = series.id
    await db.delete(raid)
    await db.flush()

    stats = await _tick(db)
    assert (stats.repeats_posted, stats.repeats_stopped) == (0, 0)
    assert await db.get(WowRaidSeries, series_id) is None
    assert fake_discord.channel_posts() == []
    assert fake_discord.dms_to(_CREATOR) == []


async def test_a_dst_change_never_posts_two_raids_of_a_repeat_in_one_tick(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    # Half an hour before the Saturday 31 March raid.  The clocks spring forward that night, so the
    # 7 April raid comes 167 hours later: posted when the one before starts, less an hour, it's due already.
    now = datetime(2001, 4, 1, 0, 30, tzinfo=timezone.utc)
    series, raid = await _repeat(db, next_starts_at=_slot(3, 31), raid_at=_slot(3, 24))

    stats = await _tick(db, now)
    assert stats.repeats_posted == 1
    assert len(fake_discord.channel_posts()) == 1
    await db.refresh(series)
    assert series.next_starts_at == _slot(4, 7)
    assert raid_repeat.post_at(series) <= now

    stats = await _tick(db, now)
    assert stats.repeats_posted == 1
    assert len(fake_discord.channel_posts()) == 2
    assert [r.starts_at for r in await _raids(db, series.guild_id)] == [_slot(3, 24), _slot(3, 31), _slot(4, 7)]


# ---------------------------------------------------------------------------
# When Discord doesn't take the post
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "code", "reason"),
    [
        (403, MISSING_PERMISSIONS, f"I don't have permission to post in <#{CHANNEL}>"),
        (404, UNKNOWN_CHANNEL, "I can't find its channel anymore"),
        (400, 50035, "Discord didn't accept the post"),
    ],
)
async def test_a_post_discord_refuses_stops_the_repeat_and_dms_its_creator(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord, status: int, code: int, reason: str
) -> None:
    db = bound_unit_of_work
    series, raid = await _repeat(db)
    series_id = series.id
    fake_discord.fail("POST", _POSTS, status, code)

    stats = await _tick(db)
    assert (stats.repeats_posted, stats.repeats_stopped) == (0, 1)
    assert await _raids(db, raid.guild_id) == [raid]
    assert await db.get(WowRaidSeries, series_id) is None
    await db.refresh(raid)
    assert raid.series_id is None
    (dm,) = fake_discord.dms_to(_CREATOR)
    assert dm.body == _dm(raid, reason)


async def test_a_creator_who_turned_dms_off_isnt_told_their_repeat_stopped(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    series, raid = await _repeat(db)
    await wow_raid_member_pref_repo.upsert(db, guild_id=raid.guild_id, discord_user_id=_CREATOR, dm_opt_out=True)
    fake_discord.fail("POST", _POSTS, 403, MISSING_PERMISSIONS)

    stats = await _tick(db)
    assert stats.repeats_stopped == 1
    assert fake_discord.dms_to(_CREATOR) == []


def _time_out(fake_discord: FakeDiscord) -> None:
    fake_discord.time_out("POST", _POSTS)


def _busy(fake_discord: FakeDiscord) -> None:
    fake_discord.fail("POST", _POSTS, 503, 0)


@pytest.mark.parametrize("silence", [_time_out, _busy], ids=["timeout", "5xx"])
async def test_discord_silent_or_busy_changes_nothing_and_the_next_tick_posts(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord, silence: Callable[[FakeDiscord], None]
) -> None:
    db = bound_unit_of_work
    series, raid = await _repeat(db)
    silence(fake_discord)

    stats = await _tick(db)
    assert (stats.repeats_posted, stats.repeats_stopped) == (0, 0)
    assert len(fake_discord.channel_posts()) == 1
    assert await _raids(db, series.guild_id) == [raid]
    await db.refresh(series)
    assert series.next_starts_at == _slot(2, 20)

    stats = await _tick(db)
    assert stats.repeats_posted == 1
    assert len(fake_discord.channel_posts()) == 2
    assert [r.starts_at for r in await _raids(db, series.guild_id)] == [_slot(2, 13), _slot(2, 20)]


async def test_a_repeat_that_breaks_stops_and_the_others_still_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = bound_unit_of_work
    broken, broken_raid = await _repeat(db)
    broken_id = broken.id
    broken_raid.title = "Broken"
    other, other_raid = await _repeat(
        db, next_starts_at=_slot(2, 20, hour=21), raid_at=_slot(2, 13, hour=21), message_id="9102"
    )
    real = raid_repeat_publisher.build_initial_post

    def build(event: WowRaidEvent, *args: Any, **kwargs: Any) -> dict[str, Any]:
        if event.title == "Broken":
            raise RuntimeError("boom")
        return real(event, *args, **kwargs)

    monkeypatch.setattr(raid_repeat_publisher, "build_initial_post", build)

    stats = await _tick(db)
    assert (stats.repeats_posted, stats.repeats_stopped) == (1, 1)
    assert await db.get(WowRaidSeries, broken_id) is None
    (dm,) = fake_discord.dms_to(_CREATOR)
    assert dm.body == _dm(broken_raid, "something went wrong posting it")
    assert len(fake_discord.channel_posts()) == 1
    raids = await _raids(db, other.guild_id)
    assert [(r.starts_at, r.series_id) for r in raids if r.id not in (broken_raid.id, other_raid.id)] == [
        (_slot(2, 20, hour=21), other.id)
    ]
    await db.refresh(other)
    assert other.next_starts_at == _slot(2, 27, hour=21)


# ---------------------------------------------------------------------------
# Two workers at once (real commits, separate connections)
# ---------------------------------------------------------------------------


async def test_two_workers_at_once_post_a_repeats_raid_once(
    db_engine: AsyncEngine, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    # The started raid's re-render reads the committed rows too.
    monkeypatch.setattr(raid_publisher, "unit_of_work", scope)
    guild_discord_id = f"repeat-{uuid.uuid4().hex[:12]}"
    try:
        async with scope() as db:
            series, _ = await _repeat(db, guild_discord_id=guild_discord_id)

        results = await asyncio.gather(
            process_due_notifications(now=_NOW, session_scope=scope),
            process_due_notifications(now=_NOW, session_scope=scope),
        )

        assert sum(r.repeats_posted for r in results) == 1
        assert len(fake_discord.channel_posts()) == 1
        async with scope() as db:
            assert [r.starts_at for r in await _raids(db, series.guild_id)] == [_slot(2, 13), _slot(2, 20)]
    finally:
        async with scope() as db:
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == guild_discord_id))


# ---------------------------------------------------------------------------
# The table's CHECKs
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "change",
    [
        {"every_days": 0},
        {"every_days": 29},
        {"post_ahead_hours": 0},
        {"every_days": 28, "post_ahead_hours": 337},
        # Daily, posted two weeks ahead: never further ahead than the interval.
        {"every_days": 1, "post_ahead_hours": 336},
    ],
    ids=["every-0", "every-29", "ahead-0", "ahead-337", "daily-two-weeks-ahead"],
)
async def test_the_repeat_table_refuses_what_the_bot_never_writes(db: AsyncSession, change: dict[str, int]) -> None:
    series, _ = await _repeat(db)
    for name, value in change.items():
        setattr(series, name, value)
    with pytest.raises(IntegrityError):
        await db.flush()
