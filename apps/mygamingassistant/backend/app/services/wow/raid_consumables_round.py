"""The consumables round — who gets a raid's checklist DM, and when.

A raid's round opens ``consumables_reminder_minutes`` before it starts (24h by
default — ``wow_raid_notification_repo.consumables_due_at``).  Every DM row in
a round carries that ``due_at``, so ``uq_wowraidnotif_user_notif`` keeps a
player to one checklist DM per raid time, whichever path adds the row:

* the round's trigger row fans out when it comes due (the notification
  worker), and
* every worker run's late pass (``schedule_late_dms``) adds a row for anyone
  who became eligible after the round opened — a late signup, a move up
  from the queue, DMs switched back on, or a signup on a raid posted inside the
  window (whose trigger was never scheduled) — unless the raid starts within
  ``LATE_DM_MIN_LEAD``.

Eligible = signed up as confirmed, late or tentative, with DMs not turned off.
A time edit moves the round, so players are DMed again with the new time.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.wow.raid_roster import SEAT_STATUSES, TENTATIVE_STATUS, ordered_user_ids

KIND: Final = "consumables_reminder"

# Who gets the checklist DM (spec: confirmed + tentative + late).
DM_STATUSES: Final = (*SEAT_STATUSES, TENTATIVE_STATUS)

# No late DMs this close to the pull — the ready check covers the last hour.
LATE_DM_MIN_LEAD: Final = timedelta(hours=1)


@dataclass(frozen=True)
class RoundDms:
    due_at: datetime
    players: int  # players with a DM row in the round
    inserted: int  # rows this call added


def round_due_at(event: WowRaidEvent, guild: WowRaidGuild) -> datetime:
    """When *event*'s current round opens."""
    return wow_raid_notification_repo.consumables_due_at(event.starts_at, guild.settings)


async def schedule_dms(db: AsyncSession, event: WowRaidEvent, guild: WowRaidGuild) -> RoundDms:
    """Give every eligible player without one a DM row in *event*'s current round."""
    due_at = round_due_at(event, guild)
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    candidates = ordered_user_ids(s for s in signups if s.status in DM_STATUSES)
    already = await wow_raid_notification_repo.scheduled_user_ids(
        db, event_id=event.id, kind=KIND, due_at=due_at
    )
    fresh = [user_id for user_id in candidates if user_id not in already]
    opted_out = await wow_raid_member_pref_repo.opted_out_user_ids(
        db, guild_id=guild.id, discord_user_ids=fresh
    )
    recipients = [user_id for user_id in fresh if user_id not in opted_out]
    inserted = await wow_raid_notification_repo.schedule_user_rows(
        db, event_id=event.id, kind=KIND, due_at=due_at, user_ids=recipients
    )
    return RoundDms(due_at=due_at, players=len(already) + len(recipients), inserted=inserted)


async def schedule_late_dms(db: AsyncSession, now: datetime) -> int:
    """DM rows for players who became eligible after their raid's round opened.

    Raids whose round hasn't opened yet are left to their trigger's fan-out.
    Returns the number of rows inserted.
    """
    inserted = 0
    events = await wow_raid_event_repo.list_scheduled_starting_after(db, after=now + LATE_DM_MIN_LEAD)
    for event in events:
        guild = await wow_raid_guild_repo.get(db, event.guild_id)
        if guild is not None and round_due_at(event, guild) <= now:
            inserted += (await schedule_dms(db, event, guild)).inserted
    return inserted
