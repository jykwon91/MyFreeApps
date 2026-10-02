"""The notification worker's sign-up deadline and start sweeps, against real Postgres.

Discord REST is the harness's ``FakeDiscord`` (the ``fake_discord`` fixture).
Most tests run inside the SAVEPOINT-bound ``db`` session
(``bound_unit_of_work``); the two-worker test commits for real on separate
connections and cleans up after itself.

Every timestamp is in 2001, so no real row in the shared local test database
is ever due.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo, wow_raid_member_pref_repo
from app.services.discord import raid_publisher, rest
from app.services.discord.raid_deadline_copy import closed_dm
from app.services.wow.raid_deadline import STARTED_HINT
from app.services.wow.raid_embed import COLOR_CLOSED
from app.services.wow.raid_notification_worker import process_due_notifications

from discord_raid_harness import CHANNEL, FakeDiscord

_NOW = datetime(2001, 3, 1, 12, 0, tzinfo=timezone.utc)
_GUILD = "5160"
_POST = "9001"
_LEADER = "31"


@pytest.fixture(autouse=True)
def _discord_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)


async def _raid(
    db: AsyncSession,
    *,
    starts_at: datetime,
    deadline: int | None = None,
    status: str = "scheduled",
    guild_discord_id: str = _GUILD,
    message_id: str = _POST,
) -> WowRaidEvent:
    """A raid led by ``_LEADER``, posted as *message_id*, with sign-ups closing *deadline* minutes before."""
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=guild_discord_id, raid_channel_id=CHANNEL)
    event = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key="onyxia", starts_at=starts_at, size_cap=10,
        channel_id=CHANNEL, created_by_user_id=_LEADER, status=status,
    )
    await wow_raid_event_repo.set_message_id(db, event, message_id)
    await wow_raid_event_repo.set_signup_deadline(db, event, deadline)
    return event


def _edited(fake_discord: FakeDiscord) -> dict[str, Any]:
    """The raid post as its one re-render left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.path == f"/channels/{CHANNEL}/messages/{_POST}" and edit.body is not None
    return edit.body


# ---------------------------------------------------------------------------
# The deadline sweep
# ---------------------------------------------------------------------------


async def test_the_deadline_closes_sign_ups_greys_the_post_and_dms_the_leader(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    due = await _raid(db, starts_at=_NOW + timedelta(hours=2), deadline=120)
    ahead = await _raid(db, starts_at=_NOW + timedelta(hours=2, seconds=1), deadline=120, message_id="9002")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.started) == (1, 0)
    await db.refresh(due)
    await db.refresh(ahead)
    assert (due.closed_at, due.close_reason, due.deadline_applied_at) == (_NOW, "deadline", _NOW)
    assert (ahead.closed_at, ahead.deadline_applied_at) == (None, None)
    assert _edited(fake_discord)["embeds"][0]["color"] == COLOR_CLOSED
    (dm,) = fake_discord.dms_to(_LEADER)
    link = rest.message_link(_GUILD, CHANNEL, _POST)
    assert dm.body == {"content": closed_dm(due, link), "allowed_mentions": {"parse": []}}

    # The stamp makes it once: the next tick, in the same second, does nothing.
    fake_discord.clear()
    again = await process_due_notifications(now=_NOW)
    assert again.deadline_closed == 0
    assert fake_discord.calls == []


async def test_a_leader_who_turned_dms_off_gets_no_dm(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=1), deadline=120)
    await wow_raid_member_pref_repo.upsert(db, guild_id=event.guild_id, discord_user_id=_LEADER, dm_opt_out=True)

    stats = await process_due_notifications(now=_NOW)
    assert stats.deadline_closed == 1
    assert _edited(fake_discord)["embeds"][0]["color"] == COLOR_CLOSED
    assert fake_discord.dms_to(_LEADER) == []


async def test_a_raid_its_leader_closed_is_only_stamped(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=1), deadline=120)
    closed_at = _NOW - timedelta(hours=3)
    await wow_raid_event_repo.set_close_state(db, event, closed_at=closed_at, close_reason="leader", applied_at=None)

    stats = await process_due_notifications(now=_NOW)
    assert stats.deadline_closed == 0
    await db.refresh(event)
    assert (event.closed_at, event.close_reason, event.deadline_applied_at) == (closed_at, "leader", _NOW)
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# The start sweep
# ---------------------------------------------------------------------------


async def test_a_started_raid_greys_its_post_once_with_every_button_off(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.started) == (0, 1)
    await db.refresh(event)
    assert event.start_applied_at == _NOW and event.status == "scheduled"
    body = _edited(fake_discord)
    [embed] = body["embeds"]
    assert embed["color"] == COLOR_CLOSED
    assert embed["footer"]["text"].endswith(STARTED_HINT)
    assert all(c["disabled"] for row in body["components"] for c in row["components"])
    assert fake_discord.find("POST", "/users/@me/channels") == []  # no DMs

    fake_discord.clear()
    again = await process_due_notifications(now=_NOW + timedelta(minutes=1))
    assert again.started == 0
    assert fake_discord.calls == []


async def test_a_started_raids_deleted_post_isnt_posted_again(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(minutes=1))
    fake_discord.fail("PATCH", f"/channels/{CHANNEL}/messages/{_POST}", 404, 10008)

    stats = await process_due_notifications(now=_NOW)
    assert stats.started == 1
    await db.refresh(event)
    assert event.message_id is None
    assert fake_discord.channel_posts() == []


async def test_after_downtime_a_finished_raid_is_greyed_before_its_completed(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW - timedelta(hours=7), deadline=120)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.started, stats.completed_events) == (0, 1, 1)
    await db.refresh(event)
    assert event.status == "completed" and event.deadline_applied_at is None
    assert _edited(fake_discord)["embeds"][0]["footer"]["text"].endswith(STARTED_HINT)
    assert fake_discord.find("POST", "/users/@me/channels") == []  # a deadline long gone DMs nobody


@pytest.mark.parametrize("status", ["draft", "cancelled"])
async def test_drafts_and_cancelled_raids_are_never_swept(
    status: str, bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    due = await _raid(db, starts_at=_NOW + timedelta(hours=1), deadline=120, status=status)
    started = await _raid(db, starts_at=_NOW - timedelta(minutes=1), status=status, message_id="9002")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.started) == (0, 0)
    for event in (due, started):
        await db.refresh(event)
        assert (event.closed_at, event.deadline_applied_at, event.start_applied_at) == (None, None, None)
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# Two workers at once (real commits, separate connections)
# ---------------------------------------------------------------------------


async def test_two_workers_at_once_grey_each_post_once_and_dm_once(
    db_engine: AsyncEngine, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    # The post's re-render reads the committed rows too.
    monkeypatch.setattr(raid_publisher, "unit_of_work", scope)
    guild_discord_id = f"sweep-{uuid.uuid4().hex[:12]}"
    try:
        async with scope() as db:
            await _raid(db, starts_at=_NOW + timedelta(hours=1), deadline=120, guild_discord_id=guild_discord_id)
            await _raid(
                db, starts_at=_NOW - timedelta(minutes=1), guild_discord_id=guild_discord_id, message_id="9002"
            )

        results = await asyncio.gather(
            process_due_notifications(now=_NOW, session_scope=scope),
            process_due_notifications(now=_NOW, session_scope=scope),
        )

        assert sum(r.deadline_closed for r in results) == 1
        assert sum(r.started for r in results) == 1
        assert sorted(c.path.rsplit("/", 1)[-1] for c in fake_discord.public_edits()) == [_POST, "9002"]
        assert len(fake_discord.dms_to(_LEADER)) == 1
    finally:
        async with scope() as db:
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == guild_discord_id))


# ---------------------------------------------------------------------------
# The columns' CHECKs
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("column", "value"),
    [("signup_deadline_minutes", 0), ("signup_deadline_minutes", 10081), ("close_reason", "bogus")],
)
async def test_the_new_columns_refuse_what_the_bot_never_writes(db: AsyncSession, column: str, value: object) -> None:
    event = await _raid(db, starts_at=_NOW + timedelta(days=1))
    setattr(event, column, value)
    with pytest.raises(IntegrityError):
        await db.flush()
