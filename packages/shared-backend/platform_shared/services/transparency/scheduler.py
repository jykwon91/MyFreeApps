"""Scheduling primitives for the transparency primary's daily cost sync.

The cost sync must run in exactly ONE process platform-wide — it calls the
Anthropic Cost Report API and read-modify-writes the single shared
transparency object. An in-process loop started from an API lifespan would
run once per uvicorn worker (and restart with every API restart/scale), so
the primary app drives the sync from its dedicated single-replica scheduler
worker instead (MyBookkeeper: ``app/workers/scheduler_worker.py``).

This module holds only the app-agnostic pieces that worker needs:

- ``is_daily_sync_due`` — pure: is a run owed given the last run and now?
  ``None`` (process just started) is always due, so a fresh deploy fills the
  shared object immediately; after that, a run is owed once the most recent
  daily slot (``DAILY_SYNC_HOUR_UTC:DAILY_SYNC_MINUTE_UTC``) has passed since
  the last run.
- ``run_cost_sync_once`` — run one sync without ever propagating its failure,
  so a failed run never kills the worker loop and (because ``cost_sync``
  fetches before it writes) never overwrites a good figure with a zero. It
  returns whether the run succeeded; the caller records ``last_run`` only on
  success, so a failure stays due and is retried on the caller's next tick.

The caller owns the gate on ``settings.transparency_primary``.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from platform_shared.core.aware_datetime import require_aware_utc
from platform_shared.services.transparency import cost_sync
from platform_shared.services.transparency.cost_sync import CostSyncSettings
from platform_shared.services.transparency.sync_schedule_constants import (
    DAILY_SYNC_HOUR_UTC,
    DAILY_SYNC_MINUTE_UTC,
)

logger = logging.getLogger(__name__)


def _latest_slot_at_or_before(now: datetime) -> datetime:
    """The most recent daily sync slot that is not after ``now`` (UTC)."""
    slot = now.replace(
        hour=DAILY_SYNC_HOUR_UTC,
        minute=DAILY_SYNC_MINUTE_UTC,
        second=0,
        microsecond=0,
    )
    if slot > now:
        slot -= timedelta(days=1)
    return slot


def is_daily_sync_due(*, last_run: datetime | None, now: datetime) -> bool:
    """Whether the daily cost sync is owed at ``now``.

    ``last_run`` is when the previous run succeeded, or ``None`` if this
    process has not completed one yet — the startup catch-up. Both datetimes
    must be timezone-aware (any zone; the slot is evaluated in UTC).

    Raises:
        ValueError: If ``now`` or ``last_run`` is naive — its zone, and so
            whether the UTC slot has passed, would be a guess.
    """
    now_utc = require_aware_utc(now, name="now")
    if last_run is None:
        return True
    return require_aware_utc(last_run, name="last_run") < _latest_slot_at_or_before(now_utc)


async def run_cost_sync_once(settings: CostSyncSettings) -> bool:
    """Run one cost sync; return whether it succeeded. Never raises.

    A failed run (Anthropic outage, MinIO blip) is logged at ERROR with the
    traceback and reported as ``False`` so the caller retries it; the
    previously stored figure stays intact because ``cost_sync`` fetches
    before it writes.
    """
    try:
        await cost_sync.run_cost_sync(settings)
    except Exception:  # noqa: BLE001 — a daily job must not take its host loop down
        logger.exception("Transparency cost sync failed; will retry")
        return False
    return True


__all__ = [
    "is_daily_sync_due",
    "run_cost_sync_once",
]
