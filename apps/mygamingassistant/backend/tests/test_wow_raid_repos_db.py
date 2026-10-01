"""WoW raid repositories against real Postgres (migration 0025).

Pins the behaviour the pure tests can't: ON CONFLICT upserts, the partial
unique indexes on the notification outbox, SKIP LOCKED claiming, and the
CHECK constraints.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_notification import MAX_ATTEMPTS
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)

_NOW = datetime(2026, 12, 9, 12, 0, tzinfo=timezone.utc)


async def _make_event(db: AsyncSession, *, starts_at: datetime) -> WowRaidEvent:
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="100")
    return await wow_raid_event_repo.create(
        db,
        guild_id=guild.id,
        raid_key="hyjal_summit",
        starts_at=starts_at,
        size_cap=20,
        channel_id="200",
        created_by_user_id="300",
    )


async def test_guild_upsert_defaults_and_resets_timezone(db: AsyncSession) -> None:
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="1")
    assert guild.timezone == "UTC"
    assert guild.settings["ready_check_minutes"] == 60

    await wow_raid_guild_repo.upsert_config(db, discord_guild_id="1", timezone="America/Chicago")
    await wow_raid_guild_repo.upsert_config(db, discord_guild_id="1", timezone="UTC")
    again = await wow_raid_guild_repo.get_by_discord_id(db, "1")
    assert again is not None and again.timezone == "UTC"


async def test_signup_upsert_updates_in_place_and_keeps_signed_up_at(db: AsyncSession) -> None:
    event = await _make_event(db, starts_at=_NOW + timedelta(days=3))
    first = await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="9", display_name="Thrall",
        status="tentative", wow_class="shaman", role="healer",
    )
    signed_up_at = first.signed_up_at
    assert first.spec is None

    second = await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="9", display_name="Thrall",
        status="confirmed", wow_class="shaman", role="healer", spec="restoration",
    )
    assert second.id == first.id
    assert second.status == "confirmed"
    assert second.spec == "restoration"
    assert second.signed_up_at == signed_up_at
    assert len(await wow_raid_signup_repo.list_for_event(db, event.id)) == 1


async def test_schedule_is_idempotent_and_skips_past_due(db: AsyncSession) -> None:
    # Raid 20h out: the 48h + 24h nudges and the 24h consumables row are past.
    event = await _make_event(db, starts_at=_NOW + timedelta(hours=20))
    settings = {"nudge_offsets_minutes": [2880, 1440], "consumables_reminder_minutes": 1440,
                "ready_check_minutes": 60}

    inserted = await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings=settings, now=_NOW,
    )
    assert inserted == 1  # only the ready-check survives
    again = await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings=settings, now=_NOW,
    )
    assert again == 0


async def test_claim_mark_and_give_up(db: AsyncSession) -> None:
    event = await _make_event(db, starts_at=_NOW + timedelta(days=3))
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings={}, now=_NOW,
    )

    later = event.starts_at - timedelta(minutes=30)  # everything is due
    claimed = await wow_raid_notification_repo.claim_due(db, now=later)
    assert len(claimed) == 4
    # Claimed rows aren't handed out again until the claim goes stale.
    assert await wow_raid_notification_repo.claim_due(db, now=later) == []

    await wow_raid_notification_repo.mark_sent(db, claimed[0])
    for _ in range(MAX_ATTEMPTS):
        await wow_raid_notification_repo.mark_failed(db, claimed[1], error="50007")
    assert claimed[1].sent_at is not None  # given up

    stale = later + timedelta(minutes=11)
    reclaimed = await wow_raid_notification_repo.claim_due(db, now=stale)
    assert {n.id for n in reclaimed} == {claimed[2].id, claimed[3].id}

    deleted = await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
    assert deleted == 2


async def test_raid_key_check_constraint(db: AsyncSession) -> None:
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="2")
    with pytest.raises(IntegrityError):
        await wow_raid_event_repo.create(
            db, guild_id=guild.id, raid_key="karazhan", starts_at=_NOW,
            size_cap=10, channel_id="1", created_by_user_id="1",
        )
