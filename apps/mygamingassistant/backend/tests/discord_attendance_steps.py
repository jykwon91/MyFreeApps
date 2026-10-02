"""Steps the attendance and export flows share: raids written straight to the repositories, and the card's clicks.

Players are numbered: ``member(n)`` is their 18-digit id and ``name(n)`` their name.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_attendance_repo,
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_signup_repo,
)
from app.services.wow import raid_attendance_service, raid_custom_id

from discord_raid_harness import CHANNEL, GUILD, ORGANISER, ORGANISER_PERMS, Post, click, setup_guild


def member(n: int) -> str:
    return str(100_000_000_000_000_000 + n)


def name(n: int) -> str:
    return f"Player{n:02d}"


def now() -> datetime:
    return datetime.now(timezone.utc)


def unix(at: datetime) -> int:
    return int(at.timestamp())


async def guild(post: Post, db: AsyncSession) -> WowRaidGuild:
    """The harness's server, set up through /raid-admin setup."""
    await setup_guild(post)
    found = await wow_raid_guild_repo.get_by_discord_id(db, GUILD)
    assert found is not None
    return found


async def raid(
    db: AsyncSession,
    where: WowRaidGuild,
    *,
    hours_ago: float = 7,
    status: str = "completed",
    raid_key: str = "onyxia",
    signups: Mapping[int, str] | None = None,
) -> WowRaidEvent:
    """A raid the organiser leads that started *hours_ago* (finished, by default), with *signups* (n → status)."""
    event = await wow_raid_event_repo.create(
        db,
        guild_id=where.id,
        raid_key=raid_key,
        starts_at=now() - timedelta(hours=hours_ago),
        size_cap=40,
        channel_id=CHANNEL,
        created_by_user_id=ORGANISER,
        status=status,
    )
    for n, signup_status in (signups or {}).items():
        await wow_raid_signup_repo.upsert_signup(
            db,
            event_id=event.id,
            discord_user_id=member(n),
            display_name=name(n),
            status=signup_status,
            wow_class="mage",
            role="dps",
            spec="frost",
        )
    return event


async def recorded(db: AsyncSession, where: WowRaidGuild, players: int = 0, **options: Any) -> WowRaidEvent:
    """A finished raid, recorded: its sign-ups' rows, then players 1…*players* attended (straight to the table)."""
    event = await raid(db, where, **options)
    await raid_attendance_service.record(db, event, now())
    rows = [
        {"discord_user_id": member(n), "display_name": name(n), "signup_status": "confirmed", "outcome": "attended"}
        for n in range(1, players + 1)
    ]
    await wow_raid_attendance_repo.add_many(db, event.id, rows)
    return event


def at(event: WowRaidEvent, verb: str, *ids: str, **as_who: Any) -> dict[str, Any]:
    """A click on the Attendance card (or its player card) — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(raid_custom_id.attendance(event.id, verb, *ids), **as_who)
