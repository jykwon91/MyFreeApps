"""Raid sweeps — the notification worker's per-tick steps before any claim.

``raid_notification_worker.process_due_notifications`` calls
:func:`run_before_claims` once per run, after its ``DISCORD_ENABLED`` check.
Each step has its own try/except: a failure is logged and ends that step for
this tick, and the outbox drains as usual.

1. **Deadline sweep.**  Sign-ups refuse from the deadline's second by the
   clock (``raid_deadline.deadline_due``); this records it.  Up to
   ``SWEEP_CAP`` raids a tick, soonest first, one transaction each: the row
   is taken with SKIP LOCKED, ``apply_deadline`` re-checks it under the
   lock, and the stamp (``deadline_applied_at``) lands with the close.
   After the commit the post is greyed and the leader DMed (unless they've
   opted out of DMs).  A raid its leader had closed is only stamped.
2. **Start sweep.**  A raid past its start has its post re-rendered once as
   started (``start_applied_at``): grey, every button off.  No DMs.
3. **Completion.**  A ``scheduled`` raid ``COMPLETE_AFTER`` past its start is
   marked ``completed`` (``wow_raid_event_repo.complete_started_events``).
4. **Late consumables DMs.**  Players eligible after their raid's round opened
   get a DM row (``raid_consumables_round.schedule_late_dms``).
5. **Repeats.**  Each repeat due posts its next raid
   (``raid_repeat_publisher.post_next``), one transaction each, at most one
   raid per repeat a tick.  A post Discord refused stops that repeat and
   DMs its creator; one it didn't answer is tried again next tick.  Last,
   because it waits on Discord while holding the repeat.

The sweeps write the new columns and ``closed_at``, never ``status``, and
run before completion, so after downtime a raid already past it is still
greyed first.  A refresh or DM that fails after the commit isn't retried:
the post catches up on its next refresh, and the DM goes out at most once.
With two workers, SKIP LOCKED and the stamps mean one refresh and at most
one DM per raid.
"""
from __future__ import annotations

import asyncio
import functools
import logging
import uuid
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import raid_deadline_copy, raid_publisher, raid_repeat_publisher, rest
from app.services.wow import raid_consumables_round, raid_event_service
from app.services.wow.raid_details import leader_id
from app.services.wow.raid_notification_outcomes import RunStats

logger = logging.getLogger(__name__)

# A scheduled raid this long past its start is marked completed.
COMPLETE_AFTER: Final = timedelta(hours=6)
# The most raids each sweep takes a tick; the rest wait for the next.
SWEEP_CAP: Final = 25

SessionScope = Callable[[], AbstractAsyncContextManager[AsyncSession]]
Clock = Callable[[], datetime]
# One raid's turn in a sweep: False when no raid is waiting.
_Step = Callable[[SessionScope, datetime, RunStats], Awaitable[bool]]


async def run_before_claims(scope: SessionScope, clock: Clock, stats: RunStats, *, stop_at: float) -> None:
    """Run every step once, in order, tallying into *stats*.  Never raises.

    ``stop_at`` is the run's time budget on the event loop's clock
    (``loop.time()``); a step that loops over raids stops there.
    """
    try:
        await _sweep(_close_one, scope, clock, stats, stop_at)
    except Exception:
        logger.exception("raid_notifications: the sign-up deadline sweep failed")

    try:
        await _sweep(_start_one, scope, clock, stats, stop_at)
    except Exception:
        logger.exception("raid_notifications: the start sweep failed")

    try:
        async with scope() as db:
            stats.completed_events = await wow_raid_event_repo.complete_started_events(
                db, started_before=clock() - COMPLETE_AFTER
            )
    except Exception:
        logger.exception("raid_notifications: completing finished raids failed")

    try:
        async with scope() as db:
            stats.late_dms = await raid_consumables_round.schedule_late_dms(db, clock())
    except Exception:
        logger.exception("raid_notifications: scheduling late consumables DMs failed")

    try:
        await _sweep(functools.partial(_repeat_one, posted=set()), scope, clock, stats, stop_at)
    except Exception:
        logger.exception("raid_notifications: posting repeating raids failed")


async def _sweep(step: _Step, scope: SessionScope, clock: Clock, stats: RunStats, stop_at: float) -> None:
    """Take raids one at a time until none is waiting, ``SWEEP_CAP`` are done or the time is up."""
    loop = asyncio.get_running_loop()
    for _ in range(SWEEP_CAP):
        if loop.time() >= stop_at or not await step(scope, clock(), stats):
            return


async def _close_one(scope: SessionScope, now: datetime, stats: RunStats) -> bool:
    """Record one raid's passed deadline; a close greys the post and DMs the leader."""
    async with scope() as db:
        event = await wow_raid_event_repo.lock_deadline_due(db, now)
        if event is None:
            return False
        if await raid_event_service.apply_deadline(db, event, now) != "closed":
            return True  # only stamped: its leader had closed sign-ups already
        event_id = event.id
        dm = await _leader_dm(db, event)
    await raid_publisher.refresh_public_message(event_id)
    if dm is not None:
        async with rest.make_rest_client() as client:
            await raid_publisher.send_dm(client, *dm)
    stats.deadline_closed += 1
    return True


async def _leader_dm(db: AsyncSession, event: WowRaidEvent) -> tuple[str, str] | None:
    """(the leader, the DM) for a close at the deadline; None when they've opted out of DMs."""
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return None
    recipients = await raid_event_service.dm_recipients(db, guild=guild, user_ids=[leader_id(event)])
    if not recipients:
        return None
    link = raid_publisher.event_link(guild.discord_guild_id, event)
    return recipients[0], raid_deadline_copy.closed_dm(event, link)


async def _start_one(scope: SessionScope, now: datetime, stats: RunStats) -> bool:
    """Grey one started raid's post: every button off, "This raid has started."."""
    async with scope() as db:
        event = await wow_raid_event_repo.lock_start_due(db, now)
        if event is None:
            return False
        await wow_raid_event_repo.set_start_applied(db, event, now)
        event_id = event.id
    await raid_publisher.refresh_public_message(event_id)
    stats.started += 1
    return True


async def _repeat_one(scope: SessionScope, now: datetime, stats: RunStats, *, posted: set[uuid.UUID]) -> bool:
    """Post one repeat's next raid; *posted* holds the repeats this tick already posted."""
    try:
        async with scope() as db:
            turn = await raid_repeat_publisher.post_next(db, now, skip=posted)
    except raid_repeat_publisher.RepeatFailed as failed:
        if await raid_repeat_publisher.stop_after_failure(scope, failed):
            stats.repeats_stopped += 1
        return True
    except raid_repeat_publisher.RepeatDeferred as deferred:
        logger.warning("raid_notifications: Discord didn't take a repeat's post (%s); trying next tick", deferred)
        return False
    if turn is None:
        return False
    if turn.kind == "posted":
        posted.add(turn.series_id)
        stats.repeats_posted += 1
    return True
