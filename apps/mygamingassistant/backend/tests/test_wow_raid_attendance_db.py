"""Raid attendance against real Postgres: the worker's sweep, [Record now]'s write, the window and the table's rules.

Discord REST is the harness's ``FakeDiscord`` (the ``fake_discord`` fixture);
the sweep itself makes no Discord calls.  Most tests run inside the
SAVEPOINT-bound ``db`` session (``bound_unit_of_work``); the two-worker test
commits for real on separate connections and cleans up after itself.

Every timestamp is in 2001, so no real row in the shared local test database
is ever due.
"""
from __future__ import annotations

import asyncio
import importlib.util
import uuid
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.wow.wow_raid_attendance import WowRaidAttendance
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_attendance_repo,
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_signup_repo,
)
from app.services.wow import raid_attendance_service
from app.services.wow.raid_attendance import WindowQuery, recorded_early
from app.services.wow.raid_notification_worker import process_due_notifications

from discord_raid_harness import CHANNEL, FakeDiscord

_NOW = datetime(2001, 3, 1, 12, 0, tzinfo=timezone.utc)
_GUILD = "5170"
_LEADER = "31"
_MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0039_wow_raid_attendance.py"
# Everyone's sign-up, and how the record has them.
_STATUSES = {"501": "confirmed", "502": "late", "503": "bench", "504": "queued", "505": "tentative", "506": "absence"}
_OUTCOMES = {"501": "attended", "502": "late", "503": "standby", "504": "standby", "505": "tentative", "506": "absent"}


@pytest.fixture(autouse=True)
def _discord_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)


async def _guild(db: AsyncSession, discord_id: str = _GUILD) -> WowRaidGuild:
    return await wow_raid_guild_repo.upsert_config(db, discord_guild_id=discord_id, raid_channel_id=CHANNEL)


async def _raid(
    db: AsyncSession,
    guild: WowRaidGuild,
    *,
    starts_at: datetime,
    status: str = "completed",
    raid_key: str = "onyxia",
    signups: Mapping[str, str] = _STATUSES,
) -> WowRaidEvent:
    """A raid led by ``_LEADER`` with *signups* (user id → status)."""
    event = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key=raid_key, starts_at=starts_at, size_cap=10,
        channel_id=CHANNEL, created_by_user_id=_LEADER, status=status,
    )
    for user_id, signup_status in signups.items():
        await wow_raid_signup_repo.upsert_signup(
            db, event_id=event.id, discord_user_id=user_id, display_name=f"P{user_id}",
            status=signup_status, wow_class="mage", role="dps", spec="frost",
        )
    return event


async def _rows(db: AsyncSession, event_id: uuid.UUID) -> dict[str, WowRaidAttendance]:
    result = await db.execute(select(WowRaidAttendance).where(WowRaidAttendance.event_id == event_id))
    return {row.discord_user_id: row for row in result.scalars().all()}


# ---------------------------------------------------------------------------
# The worker's sweep
# ---------------------------------------------------------------------------


async def test_the_sweep_records_a_finished_raid_once(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, await _guild(db), starts_at=_NOW - timedelta(hours=7))

    stats = await process_due_notifications(now=_NOW)
    assert stats.attendance_recorded == 1
    assert "attendance_recorded=1" in stats.summary()
    await db.refresh(event)
    assert event.attendance_recorded_at == _NOW
    rows = await _rows(db, event.id)
    assert {user: row.outcome for user, row in rows.items()} == _OUTCOMES
    assert {user: row.signup_status for user, row in rows.items()} == _STATUSES
    assert all(row.marked_by_user_id is None and row.marked_at is None for row in rows.values())
    assert (rows["501"].display_name, rows["501"].wow_class) == ("P501", "mage")

    # The stamp makes it once: the next tick does nothing.
    again = await process_due_notifications(now=_NOW + timedelta(minutes=1))
    assert again.attendance_recorded == 0
    await db.refresh(event)
    assert event.attendance_recorded_at == _NOW
    assert len(await _rows(db, event.id)) == len(_STATUSES)


@pytest.mark.parametrize(("status", "hours_ago"), [("draft", 7), ("cancelled", 7), ("scheduled", 1), ("scheduled", -1)])
async def test_only_a_completed_raid_is_recorded(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord, status: str, hours_ago: int
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, await _guild(db), starts_at=_NOW - timedelta(hours=hours_ago), status=status)

    stats = await process_due_notifications(now=_NOW)
    assert stats.attendance_recorded == 0
    await db.refresh(event)
    assert (event.status, event.attendance_recorded_at) == (status, None)
    assert await _rows(db, event.id) == {}


async def test_after_seven_hours_down_one_run_completes_and_records(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, await _guild(db), starts_at=_NOW - timedelta(hours=7), status="scheduled")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.completed_events, stats.attendance_recorded) == (1, 1)
    await db.refresh(event)
    assert (event.status, event.attendance_recorded_at) == ("completed", _NOW)
    assert not recorded_early(event)
    assert set(await _rows(db, event.id)) == set(_STATUSES)


async def test_record_now_freezes_it_early_and_the_sweep_leaves_it(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, await _guild(db), starts_at=_NOW - timedelta(hours=7), status="scheduled")
    early = _NOW - timedelta(hours=6, minutes=30)
    assert await raid_attendance_service.record(db, event, early) == len(_STATUSES)
    # A sign-up after the record doesn't reach it.
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="507", display_name="Late", status="confirmed"
    )

    stats = await process_due_notifications(now=_NOW)
    assert (stats.completed_events, stats.attendance_recorded) == (1, 0)
    await db.refresh(event)
    assert (event.status, event.attendance_recorded_at) == ("completed", early)
    assert recorded_early(event)
    assert set(await _rows(db, event.id)) == set(_STATUSES)


async def test_two_workers_at_once_record_a_raid_once(db_engine: AsyncEngine, fake_discord: FakeDiscord) -> None:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    discord_id = f"att-{uuid.uuid4().hex[:12]}"
    try:
        async with scope() as db:
            event = await _raid(db, await _guild(db, discord_id), starts_at=_NOW - timedelta(hours=7))
            event_id = event.id

        results = await asyncio.gather(
            process_due_notifications(now=_NOW, session_scope=scope),
            process_due_notifications(now=_NOW, session_scope=scope),
        )

        assert sum(r.attendance_recorded for r in results) == 1
        async with scope() as db:
            assert set(await _rows(db, event_id)) == set(_STATUSES)
    finally:
        async with scope() as db:
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == discord_id))


# ---------------------------------------------------------------------------
# The window
# ---------------------------------------------------------------------------


async def test_the_window_is_the_guilds_last_counted_recorded_raids(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    guild, other = await _guild(db), await _guild(db, "5171")

    async def done(days_ago: int, *, counted: bool = True, where: WowRaidGuild = guild, **raid: Any) -> WowRaidEvent:
        event = await _raid(db, where, starts_at=_NOW - timedelta(days=days_ago), **raid)
        await raid_attendance_service.record(db, event, _NOW)
        await raid_attendance_service.set_counted(db, event, counted)
        return event

    one = {"501": "confirmed"}
    d1 = await done(1, signups=one)
    d2 = await done(2, raid_key="mc", signups={"501": "confirmed", "502": "absence"})
    d3 = await done(3, signups=one)
    await done(4, signups=one, counted=False)
    await done(1, where=other, signups=one)
    await _raid(db, guild, starts_at=_NOW - timedelta(days=5), signups=one)  # finished, not recorded yet
    early = await _raid(db, guild, starts_at=_NOW - timedelta(hours=1), status="scheduled", signups=one)
    await raid_attendance_service.record(db, early, _NOW)  # recorded early, still on

    window = await raid_attendance_service.window(db, guild.id, WindowQuery())
    assert [event.id for event in window.raids] == [d1.id, d2.id, d3.id]
    assert sorted((m.event_id, m.discord_user_id) for m in window.marks) == sorted(
        [(d1.id, "501"), (d2.id, "501"), (d2.id, "502"), (d3.id, "501")]
    )
    by_raid = await raid_attendance_service.window(db, guild.id, WindowQuery(raid_key="mc"))
    assert [event.id for event in by_raid.raids] == [d2.id]
    latest = await raid_attendance_service.window(db, guild.id, WindowQuery(count=2))
    assert [event.id for event in latest.raids] == [d1.id, d2.id]

    theirs = await raid_attendance_service.player_window(db, guild.id, WindowQuery(), "502")
    assert [event.id for event in theirs.raids] == [d1.id, d2.id, d3.id]
    assert [(m.event_id, m.discord_user_id) for m in theirs.marks] == [(d2.id, "502")]
    signups = await raid_attendance_service.window_signups(db, window.raids)
    assert {event_id: len(rows) for event_id, rows in signups.items()} == {d1.id: 1, d2.id: 2, d3.id: 1}


# ---------------------------------------------------------------------------
# The table's rules
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "constraint"),
    [
        ({"outcome": "won"}, "ck_wowraidattendance_outcome"),
        ({"signup_status": "maybe"}, "ck_wowraidattendance_signup_status"),
        ({"wow_class": "bard"}, "ck_wowraidattendance_wow_class"),
        ({"marked_by_user_id": _LEADER}, "ck_wowraidattendance_marked"),
        ({"signup_status": None}, "ck_wowraidattendance_source"),
    ],
)
async def test_the_table_refuses_rows_the_bot_never_writes(
    db: AsyncSession, overrides: dict[str, object], constraint: str
) -> None:
    event = await _raid(db, await _guild(db), starts_at=_NOW, signups={})
    fields: dict[str, object] = {
        "event_id": event.id,
        "discord_user_id": "501",
        "display_name": "P501",
        "signup_status": "confirmed",
        "outcome": "attended",
    }
    db.add(WowRaidAttendance(**{**fields, **overrides}))
    with pytest.raises(IntegrityError, match=constraint):
        await db.flush()


async def test_a_new_raid_counts_and_has_one_row_per_player(db: AsyncSession) -> None:
    event = await _raid(db, await _guild(db), starts_at=_NOW, signups={})
    await db.refresh(event)
    assert (event.attendance_counted, event.attendance_recorded_at) == (True, None)

    row = {"discord_user_id": "501", "display_name": "P501", "signup_status": "confirmed", "outcome": "attended"}
    assert await wow_raid_attendance_repo.add_many(db, event.id, [row]) == 1
    assert await wow_raid_attendance_repo.add_many(db, event.id, [row]) == 0
    assert not await wow_raid_attendance_repo.add(
        db, event_id=event.id, discord_user_id="501", display_name="P501", outcome="late",
        marked_by_user_id=_LEADER, marked_at=_NOW,
    )
    db.add(WowRaidAttendance(event_id=event.id, **row))
    with pytest.raises(IntegrityError, match="uq_wowraidattendance_event_user"):
        await db.flush()


async def test_deleting_a_raid_deletes_its_attendance(db: AsyncSession) -> None:
    event = await _raid(db, await _guild(db), starts_at=_NOW - timedelta(hours=7))
    await raid_attendance_service.record(db, event, _NOW)
    event_id = event.id
    assert len(await _rows(db, event_id)) == len(_STATUSES)

    await wow_raid_event_repo.delete(db, event)
    assert await _rows(db, event_id) == {}


def test_0039_follows_0038() -> None:
    spec = importlib.util.spec_from_file_location("migration_0039", _MIGRATION)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert (migration.revision, migration.down_revision) == ("0039", "0038")
