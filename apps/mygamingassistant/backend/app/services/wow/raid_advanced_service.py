"""Raid: Edit → Advanced and /raid-admin advanced — the writes (``raid_advanced`` holds the rules).

Every write goes through ``wow_raid_advanced_repo``, and the server's ready
check through ``wow_raid_guild_repo.upsert_config`` (re-validated).  The
caller owns the transaction and, for a raid, holds its row lock.

The minimum's cancel (:func:`cancel_if_short`) takes Raid: Edit → Cancel's
path — the reason staged, then ``raid_event_service.cancel_event`` — so the
caller's ``raid_publisher.announce_cancellation`` does the rest.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_advanced_repo,
    wow_raid_guild_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.schemas.wow.raid import RaidGuildSettings
from app.services.wow import raid_advanced, raid_event_service
from app.services.wow.raid_advanced import MinimumProblem, RoleList
from app.services.wow.raid_details import leader_id
from app.services.wow.raid_roles import picked_roles
from app.services.wow.raid_roster import compute_roster_summary


@dataclass(frozen=True)
class MinimumSaved:
    """What the Minimum form did.  *closed*: the raid's sign-ups have closed, so it won't be checked."""

    kind: Literal["set", "cleared", "same", "problem"]
    value: int | None = None
    problem: MinimumProblem | None = None
    closed: bool = False


@dataclass(frozen=True)
class RolesSaved:
    """What a role menu did: the roles kept, whether @everyone was picked (left out), and whether it saved."""

    role_ids: tuple[str, ...]
    everyone: bool
    saved: bool


async def set_minimum(db: AsyncSession, event: WowRaidEvent, text: str) -> MinimumSaved:
    """The Minimum form's text: a number from 1 to the raid's size, or empty for none."""
    parsed = raid_advanced.parse_minimum(text, event.size_cap)
    if isinstance(parsed, MinimumProblem):
        return MinimumSaved("problem", problem=parsed)
    closed = event.closed_at is not None or event.start_applied_at is not None
    if parsed is not None and parsed == event.min_signups:
        return MinimumSaved("same", parsed, closed=closed)
    await wow_raid_advanced_repo.set_min_signups(db, event, parsed)
    if parsed is None:
        return MinimumSaved("cleared")
    return MinimumSaved("set", parsed, closed=closed)


async def set_roles(
    db: AsyncSession, event: WowRaidEvent, which: RoleList, values: Sequence[str], *, guild_discord_id: str
) -> RolesSaved:
    """A raid's role menu: its own list (emptied = everyone / nobody).  Only @everyone picked: nothing saved."""
    picked, everyone = picked_roles(values, everyone_id=guild_discord_id)
    if everyone and not picked:
        return RolesSaved((), everyone=True, saved=False)
    await wow_raid_advanced_repo.set_event_roles(db, event, which=which, role_ids=picked)
    return RolesSaved(tuple(picked), everyone=everyone, saved=True)


async def open_to_everyone(db: AsyncSession, event: WowRaidEvent) -> None:
    """[Everyone can sign up]: the raid's own allowed list, empty."""
    await wow_raid_advanced_repo.set_event_roles(db, event, which="signup", role_ids=[])


async def follow_server_roles(db: AsyncSession, event: WowRaidEvent) -> None:
    """[Use server default]: both of the raid's lists follow the server again."""
    await wow_raid_advanced_repo.set_event_roles(db, event, which="signup", role_ids=None)
    await wow_raid_advanced_repo.set_event_roles(db, event, which="banned", role_ids=None)


async def set_server_roles(
    db: AsyncSession, guild: WowRaidGuild, which: RoleList, values: Sequence[str]
) -> RolesSaved:
    """The server's role menu: emptied clears it (everyone / nobody).  Only @everyone picked: nothing saved."""
    picked, everyone = picked_roles(values, everyone_id=guild.discord_guild_id)
    if everyone and not picked:
        return RolesSaved((), everyone=True, saved=False)
    await wow_raid_advanced_repo.set_guild_roles(db, guild, which=which, role_ids=picked or None)
    return RolesSaved(tuple(picked), everyone=everyone, saved=True)


async def set_ready_check(
    db: AsyncSession, event: WowRaidEvent, guild: WowRaidGuild, minutes: int | None, now: datetime
) -> None:
    """The raid's ready check (None = the server's); a posted raid still to start has its row moved now."""
    await wow_raid_advanced_repo.set_ready_check(db, event, minutes)
    if event.status == "scheduled" and event.starts_at > now:
        await wow_raid_notification_repo.replace_ready_check(
            db,
            event_id=event.id,
            starts_at=event.starts_at,
            guild_settings=raid_advanced.notification_settings(event, guild),
            now=now,
        )


async def set_server_ready_check(db: AsyncSession, guild: WowRaidGuild, minutes: int) -> None:
    """The server's ready check, for raids posted from now on (and raids whose time is edited)."""
    settings = RaidGuildSettings(**{**(guild.settings or {}), "ready_check_minutes": minutes})
    await wow_raid_guild_repo.upsert_config(
        db, discord_guild_id=guild.discord_guild_id, settings=settings.model_dump()
    )


async def cancel_if_short(db: AsyncSession, event: WowRaidEvent, guild: WowRaidGuild) -> list[str] | None:
    """As sign-ups close: cancel the raid if fewer than its minimum have a seat.

    Returns who to DM — everyone on the raid and its leader, opt-outs left
    out — or None when the raid isn't short (or has no minimum).
    """
    if raid_advanced.needed(event) is None:
        return None
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    short = raid_advanced.shortfall(event, compute_roster_summary(signups, size_cap=event.size_cap).seats_taken)
    if short is None:
        return None
    await raid_event_service.set_cancel_reason(db, event, raid_advanced.short_reason(short))
    dm_ids = await raid_event_service.cancel_event(db, event=event, guild=guild)
    leader = await raid_event_service.dm_recipients(db, guild=guild, user_ids=[leader_id(event)])
    return list(dict.fromkeys([*dm_ids, *leader]))
