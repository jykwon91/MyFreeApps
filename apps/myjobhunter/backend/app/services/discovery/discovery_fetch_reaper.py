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

from platform_shared.core.audit_actor import audit_actor

from app.db.session import unit_of_work
from app.repositories.discovery import discovery_repository

logger = logging.getLogger(__name__)

REAP_AFTER_MINUTES = 30


async def reap_stale_running_fetches() -> int:
    """Update discovery_fetches stuck in ``'running'`` for >30 min to ``'error'``.

    Returns the number of rows reaped so the caller can log it.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=REAP_AFTER_MINUTES)
    async with unit_of_work() as db:
        stale = await discovery_repository.lock_stale_fetches(db, cutoff=cutoff)
        for fetch in stale:
            # Startup runs with no signed-in user; each row is audited as its owner.
            with audit_actor(fetch.user_id):
                await discovery_repository.mark_reaped(db, fetch)
    return len(stale)
