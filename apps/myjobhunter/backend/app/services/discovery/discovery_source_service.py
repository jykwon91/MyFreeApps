"""Service wrappers for saved-search (DiscoverySource) mutations.

Owns the transaction boundary for create and deactivate operations so route
handlers never call ``db.commit()`` directly.  Per the MJH layered-architecture
convention: routes → services → repositories; services commit, repositories
only ``add``/``flush``.

Also owns the side-effects on the in-process APScheduler. Creates register a
scheduled job; deactivates remove one. This keeps the DB row and the
schedule in lockstep — there is no path that creates a source without
scheduling it (or deactivates without unscheduling). See
``discovery_scheduler_service`` for the scheduler design rationale.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository
from app.services.discovery import discovery_scheduler_service
from app.services.discovery.discovery_scheduler_service import (
    SchedulerNotStartedError,
)


logger = logging.getLogger(__name__)


async def create_source(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search and commit the transaction.

    After commit, registers a scheduled fetch with APScheduler so the
    source is automatically refreshed on its configured cadence. A
    scheduler-registration failure is logged but does NOT rollback the
    create — the source row is still valid and the operator can use
    manual refresh. The next process restart re-syncs the schedule via
    ``register_source_jobs``.
    """
    src = await discovery_repository.create_source(
        db,
        user_id=user_id,
        source=source,
        config=config,
        fetch_interval_minutes=fetch_interval_minutes,
    )
    await db.commit()
    await db.refresh(src)

    try:
        discovery_scheduler_service.add_source_job(
            source_id=src.id,
            user_id=src.user_id,
            interval_minutes=src.fetch_interval_minutes,
        )
    except SchedulerNotStartedError:
        # Tests / scripts that exercise the service without booting the
        # full lifespan won't have the scheduler running. Log + continue —
        # the row is committed and the schedule will be picked up on
        # next ``register_source_jobs`` sweep.
        logger.warning(
            "create_source: scheduler not started; source %s saved but "
            "schedule will be picked up on next process start",
            src.id,
        )

    return src


async def deactivate_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a saved search.  Returns False when not found / wrong owner.

    Also removes the scheduled fetch from APScheduler so we don't keep
    firing for an inactive source. The scheduler job-runner has a
    defensive ``is_active`` check too, so a race between deactivate and
    fire-time is harmless.
    """
    ok = await discovery_repository.deactivate_source(db, source_id, user_id)
    if not ok:
        return False
    await db.commit()

    try:
        discovery_scheduler_service.remove_source_job(source_id)
    except SchedulerNotStartedError:
        # As above — tolerated when scheduler isn't running.
        logger.warning(
            "deactivate_source: scheduler not started; source %s deactivated "
            "but no schedule removal needed",
            source_id,
        )

    return True
