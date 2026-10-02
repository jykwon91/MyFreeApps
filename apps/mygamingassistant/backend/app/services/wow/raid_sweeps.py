"""Raid sweeps — the notification worker's per-tick steps before any claim.

``raid_notification_worker.process_due_notifications`` calls
:func:`run_before_claims` once per run, after its ``DISCORD_ENABLED`` check.
Each step has its own try/except: a failure is logged and ends that step for
this tick, and the outbox drains as usual.

1. **Completion.**  A ``scheduled`` raid ``COMPLETE_AFTER`` past its start is
   marked ``completed`` (``wow_raid_event_repo.complete_started_events``).
2. **Late consumables DMs.**  Players eligible after their raid's round opened
   get a DM row (``raid_consumables_round.schedule_late_dms``).
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.wow import wow_raid_event_repo
from app.services.wow import raid_consumables_round
from app.services.wow.raid_notification_outcomes import RunStats

logger = logging.getLogger(__name__)

# A scheduled raid this long past its start is marked completed.
COMPLETE_AFTER: Final = timedelta(hours=6)

SessionScope = Callable[[], AbstractAsyncContextManager[AsyncSession]]
Clock = Callable[[], datetime]


async def run_before_claims(scope: SessionScope, clock: Clock, stats: RunStats, *, stop_at: float) -> None:
    """Run every step once, in order, tallying into *stats*.  Never raises.

    ``stop_at`` is the run's time budget on the event loop's clock
    (``loop.time()``); a step that loops over raids stops there.
    """
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
