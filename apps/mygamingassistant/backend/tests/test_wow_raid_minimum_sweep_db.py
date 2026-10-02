"""A raid's minimum sign-ups, checked as its sign-ups close by themselves — against real Postgres.

The deadline sweep checks it as it closes sign-ups, the start sweep when
sign-ups were still open at the start; a raid short of its minimum is
cancelled — its post greyed, a line in the channel, DMs to everyone on it and
its leader, its Discord event and thread cleaned up.  A raid its leader closed
is never checked.  Discord REST is the harness's ``FakeDiscord``; every test
runs inside the SAVEPOINT-bound session (``bound_unit_of_work``).

Every timestamp is in 2001, so no real row in the shared local test database
is ever due.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.repositories.wow import (
    wow_raid_advanced_repo,
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.wow import raid_event_service
from app.services.wow.raid_notification_worker import process_due_notifications

from discord_raid_harness import CHANNEL, FakeDiscord

_NOW = datetime(2001, 3, 1, 12, 0, tzinfo=timezone.utc)
_GUILD = "5170"
_POST = "9101"
_LEADER = "41"
_NO_MENTIONS = {"parse": []}


@pytest.fixture(autouse=True)
def _discord_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)


async def _raid(
    db: AsyncSession, *, starts_at: datetime, minimum: int | None, deadline: int | None = None
) -> WowRaidEvent:
    """A posted ten-player raid led by ``_LEADER``, with a minimum and sign-ups closing *deadline* minutes before."""
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=_GUILD, raid_channel_id=CHANNEL)
    event = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key="onyxia", starts_at=starts_at, size_cap=10,
        channel_id=CHANNEL, created_by_user_id=_LEADER, status="scheduled",
    )
    await wow_raid_event_repo.set_message_id(db, event, _POST)
    await wow_raid_event_repo.set_signup_deadline(db, event, deadline)
    await wow_raid_advanced_repo.set_min_signups(db, event, minimum)
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


async def _pending(db: AsyncSession, event: WowRaidEvent) -> list[str]:
    rows = await db.execute(
        select(WowRaidNotification.kind).where(
            WowRaidNotification.event_id == event.id, WowRaidNotification.sent_at.is_(None)
        )
    )
    return sorted(rows.scalars())


def _dm_text(fake_discord: FakeDiscord, user_id: str) -> str:
    (dm,) = fake_discord.dms_to(user_id)
    assert dm.body is not None and dm.body["allowed_mentions"] == _NO_MENTIONS
    return dm.body["content"]


def _channel_line(fake_discord: FakeDiscord) -> str:
    (line,) = fake_discord.channel_posts()
    assert line.body is not None and line.body["allowed_mentions"] == _NO_MENTIONS
    return line.body["content"]


# ---------------------------------------------------------------------------
# At the deadline
# ---------------------------------------------------------------------------


async def test_a_raid_short_at_its_deadline_is_cancelled_and_everyone_told(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=2), minimum=3, deadline=120)
    await _sign_up(db, event, "51")
    await _sign_up(db, event, "52", "late")
    await _sign_up(db, event, "53", "tentative")
    await _sign_up(db, event, "54", "absence")
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings={}, now=_NOW
    )
    assert await _pending(db, event) == ["ready_check"]
    await wow_raid_event_repo.set_discord_event_state(
        db, event, event_id="ev1", digest=None, starts_at=event.starts_at, error=None
    )
    await wow_raid_event_repo.set_thread_state(db, event, thread_id="t1", name="Onyxia's Lair", error=None)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.minimum_cancelled, stats.deadline_closed) == (1, 0)
    await db.refresh(event)
    reason = "Not enough sign-ups: 2 of 3 needed."  # seats: Confirmed and Late
    assert (event.status, event.cancel_reason) == ("cancelled", reason)
    assert (event.closed_at, event.close_reason, event.deadline_applied_at) == (_NOW, "deadline", _NOW)
    assert await _pending(db, event) == []

    (edit,) = fake_discord.public_edits()
    assert edit.path == f"/channels/{CHANNEL}/messages/{_POST}"
    assert _channel_line(fake_discord).endswith(f"has been cancelled: {reason}")
    # Everyone on the raid and its leader; not who said they'd be absent.
    for user_id in ("51", "52", "53", _LEADER):
        assert _dm_text(fake_discord, user_id).endswith(f"has been cancelled.\nReason: {reason}")
    assert fake_discord.dms_to("54") == []
    # Its Discord event deleted and its thread archived (Raid: Edit → Cancel's clean-up).
    assert fake_discord.find("DELETE", f"/guilds/{_GUILD}/scheduled-events/ev1")
    assert [call.body for call in fake_discord.find("PATCH", "/channels/t1")] == [{"archived": True}]

    # Cancelled once: the next tick does nothing.
    fake_discord.clear()
    again = await process_due_notifications(now=_NOW)
    assert (again.minimum_cancelled, again.deadline_closed, again.started) == (0, 0, 0)
    assert fake_discord.calls == []


async def test_a_leader_who_turned_dms_off_gets_no_cancel_dm(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=1), minimum=2, deadline=120)
    await _sign_up(db, event, "61")
    await wow_raid_member_pref_repo.upsert(db, guild_id=event.guild_id, discord_user_id=_LEADER, dm_opt_out=True)

    stats = await process_due_notifications(now=_NOW)
    assert stats.minimum_cancelled == 1
    assert _dm_text(fake_discord, "61").endswith("Reason: Not enough sign-ups: 1 of 2 needed.")
    assert fake_discord.dms_to(_LEADER) == []


async def test_a_raid_with_enough_seats_closes_as_before(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=1), minimum=2, deadline=120)
    await _sign_up(db, event, "71")
    await _sign_up(db, event, "72", "late")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.minimum_cancelled) == (1, 0)
    await db.refresh(event)
    assert (event.status, event.closed_at, event.cancel_reason) == ("scheduled", _NOW, None)
    assert fake_discord.channel_posts() == []
    assert len(fake_discord.dms_to(_LEADER)) == 1  # the close's DM to the leader
    assert fake_discord.dms_to("71") == []


async def test_a_raid_its_leader_closed_is_never_checked(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    starts_at = _NOW + timedelta(hours=1)
    event = await _raid(db, starts_at=starts_at, minimum=5, deadline=120)
    closed_at = _NOW - timedelta(hours=3)
    await wow_raid_event_repo.set_close_state(db, event, closed_at=closed_at, close_reason="leader", applied_at=None)

    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.minimum_cancelled) == (0, 0)
    started = await process_due_notifications(now=starts_at)
    assert (started.started, started.minimum_cancelled) == (1, 0)
    await db.refresh(event)
    assert (event.status, event.cancel_reason, event.start_applied_at) == ("scheduled", None, starts_at)
    assert fake_discord.channel_posts() == []


# ---------------------------------------------------------------------------
# At the start
# ---------------------------------------------------------------------------


async def test_without_a_deadline_the_start_sweep_cancels_a_short_raid(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW, minimum=2)
    await _sign_up(db, event, "81")

    stats = await process_due_notifications(now=_NOW)
    assert (stats.minimum_cancelled, stats.started) == (1, 0)
    await db.refresh(event)
    reason = "Not enough sign-ups: 1 of 2 needed."
    assert (event.status, event.cancel_reason, event.start_applied_at) == ("cancelled", reason, _NOW)
    assert len(fake_discord.public_edits()) == 1
    assert _channel_line(fake_discord).endswith(f"has been cancelled: {reason}")
    for user_id in ("81", _LEADER):
        assert _dm_text(fake_discord, user_id).endswith(f"Reason: {reason}")

    fake_discord.clear()
    again = await process_due_notifications(now=_NOW)
    assert (again.minimum_cancelled, again.started) == (0, 0)
    assert fake_discord.calls == []


async def test_sign_ups_reopened_after_the_deadline_are_checked_at_the_start(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    starts_at = _NOW + timedelta(hours=2)
    event = await _raid(db, starts_at=starts_at, minimum=1, deadline=120)
    await _sign_up(db, event, "91")

    # At the deadline it has enough, so sign-ups close as usual.
    stats = await process_due_notifications(now=_NOW)
    assert (stats.deadline_closed, stats.minimum_cancelled) == (1, 0)
    # Its leader reopens them and raises the minimum.
    await raid_event_service.set_signups_closed(db, event, closed=False, now=_NOW + timedelta(minutes=5))
    await wow_raid_advanced_repo.set_min_signups(db, event, 2)
    await db.refresh(event)
    assert (event.closed_at, event.deadline_applied_at) == (None, _NOW)

    fake_discord.clear()
    started = await process_due_notifications(now=starts_at)
    assert (started.minimum_cancelled, started.started) == (1, 0)
    await db.refresh(event)
    assert (event.status, event.cancel_reason) == ("cancelled", "Not enough sign-ups: 1 of 2 needed.")
    assert _dm_text(fake_discord, "91").endswith("Reason: Not enough sign-ups: 1 of 2 needed.")
