"""Reaper for discovery_fetches rows stuck in ``status='running'``.

A backend crash mid-fetch leaves the audit row in ``status='running'``
indefinitely. Nothing in the normal fetch cycle will ever touch it again
because every new fetch creates a new row — so the zombie row stays
``running`` forever and corrupts per-source fetch-history views.

The reaper is intentionally run once at startup (rather than as a periodic
task) because:

- The most common cause is a server restart / deploy crash, so startup is
  exactly the right time to clean up.
- MJH has no periodic-task infrastructure (no Dramatiq scheduler, no Celery
  beat). Wiring a one-line startup hook is lower complexity than adding a
  scheduling layer.
- Even for rows that got stuck while the backend was alive (e.g. a slow
  adapter held the lock for >30 min), they are unreachable: the next deploy
  cleans them up rather than requiring operator intervention.

``REAP_AFTER_MINUTES = 30`` matches the threshold documented in the
``discovery_fetches`` model docstring.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.discovery import discovery_repository

logger = logging.getLogger(__name__)

REAP_AFTER_MINUTES = 30


async def reap_stale_running_fetches(db: AsyncSession) -> int:
    """Update discovery_fetches stuck in ``'running'`` for >30 min to ``'error'``.

    Returns the number of rows reaped so the caller can log it.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=REAP_AFTER_MINUTES)
    count = await discovery_repository.reap_stale_fetches(db, cutoff=cutoff)
    await db.commit()
    return count
