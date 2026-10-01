"""Raid event lifecycle — draft → posted → edited → cancelled.

The caller owns the transaction (one per Discord interaction).  Mutations
that touch seats expect the event row lock to be held
(``wow_raid_event_repo.get_for_update``).

Notification outbox
-------------------
Posting schedules the nudge / consumables / ready-check rows
(``wow_raid_notification_repo.schedule_for_event``); a time edit reschedules
(cancel pending, then schedule); cancelling drops every pending row.  The
worker that sends them is ``app/services/wow/raid_notification_worker.py``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.wow.raid_roster import (
    BENCH_STATUS,
    QUEUED_STATUS,
    SEAT_STATUSES,
    TENTATIVE_STATUS,
    compute_roster_summary,
)
from app.services.wow.raid_signup_service import promote_from_queue

PostOutcome = Literal["posted", "already_posted", "in_past", "gone"]

# Who hears about a cancellation by DM: everyone still on the list — seats,
# maybes, the queue and backups (not absences).
_CANCEL_DM_STATUSES = (*SEAT_STATUSES, TENTATIVE_STATUS, QUEUED_STATUS, BENCH_STATUS)


@dataclass(frozen=True)
class EditOutcome:
    """``min_size`` is set when the requested size is below the seats taken."""

    min_size: int | None = None
    promoted: list[str] = field(default_factory=list)
    time_changed: bool = False


async def create_draft(
    db: AsyncSession,
    *,
    guild: WowRaidGuild,
    raid_key: str,
    starts_at: datetime,
    size_cap: int,
    notes: str | None,
    created_by_user_id: str,
    created_by_display_name: str,
) -> WowRaidEvent:
    """Create the event in ``draft`` — it backs the organiser's private preview."""
    assert guild.raid_channel_id is not None, "guild must be configured before creating raids"
    return await wow_raid_event_repo.create(
        db,
        guild_id=guild.id,
        raid_key=raid_key,
        starts_at=starts_at,
        size_cap=size_cap,
        channel_id=guild.raid_channel_id,
        created_by_user_id=created_by_user_id,
        created_by_display_name=created_by_display_name,
        notes=notes,
        status="draft",
    )


async def mark_posting(
    db: AsyncSession, *, event: WowRaidEvent, guild: WowRaidGuild, now: datetime
) -> PostOutcome:
    """Flip a locked draft to ``scheduled`` and schedule its notifications.

    Idempotent: a second [Post raid] click finds the event already scheduled
    and returns ``already_posted`` without touching anything.
    """
    if event.status == "scheduled":
        return "already_posted"
    if event.status != "draft":
        return "gone"
    if event.starts_at <= now:
        return "in_past"
    event.status = "scheduled"
    # Post into the guild's current raid channel (setup may have changed
    # since the preview was created).
    if guild.raid_channel_id:
        event.channel_id = guild.raid_channel_id
    await db.flush()
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings=guild.settings, now=now
    )
    return "posted"


async def revert_to_draft(db: AsyncSession, event: WowRaidEvent) -> None:
    """Undo ``mark_posting`` after Discord refused the public post."""
    event.status = "draft"
    event.message_id = None
    await db.flush()
    await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)


async def discard_draft(db: AsyncSession, event: WowRaidEvent) -> bool:
    """Delete a draft.  Returns False if it was already posted (nothing done)."""
    if event.status != "draft":
        return False
    await wow_raid_event_repo.delete(db, event)
    return True


async def edit_event(
    db: AsyncSession,
    *,
    event: WowRaidEvent,
    guild: WowRaidGuild,
    starts_at: datetime | None,
    size_cap: int | None,
    notes: str | None,
    now: datetime,
) -> EditOutcome:
    """Apply an edit.  Rejects a size below the seats already taken."""
    if size_cap is not None:
        signups = await wow_raid_signup_repo.list_for_event(db, event.id)
        seats_taken = compute_roster_summary(signups, size_cap=event.size_cap).seats_taken
        if size_cap < seats_taken:
            return EditOutcome(min_size=seats_taken)
        event.size_cap = size_cap
    if notes is not None:
        event.notes = notes
    time_changed = starts_at is not None and starts_at != event.starts_at
    if starts_at is not None:
        event.starts_at = starts_at
    await db.flush()

    if time_changed:
        await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
        await wow_raid_notification_repo.schedule_for_event(
            db, event_id=event.id, starts_at=event.starts_at, guild_settings=guild.settings, now=now
        )

    promoted: list[str] = []
    if size_cap is not None:
        promoted = await promote_from_queue(db, event)
    return EditOutcome(promoted=promoted, time_changed=time_changed)


async def set_cancel_reason(db: AsyncSession, event: WowRaidEvent, reason: str | None) -> None:
    """Stage the reason shown on the cancelled embed (before the organiser confirms)."""
    event.cancel_reason = reason
    await db.flush()


async def cancel_event(db: AsyncSession, *, event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """Cancel a scheduled raid; return the user IDs to tell by DM (opt-outs removed)."""
    await wow_raid_event_repo.cancel(db, event)
    await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    recipients = [s.discord_user_id for s in signups if s.status in _CANCEL_DM_STATUSES]
    return await dm_recipients(db, guild=guild, user_ids=recipients)


async def dm_recipients(db: AsyncSession, *, guild: WowRaidGuild, user_ids: list[str]) -> list[str]:
    """Filter ``user_ids`` down to players who haven't opted out of DMs."""
    opted_out = await wow_raid_member_pref_repo.opted_out_user_ids(
        db, guild_id=guild.id, discord_user_ids=user_ids
    )
    return [user_id for user_id in user_ids if user_id not in opted_out]
