"""Daily cost-sync background task for the transparency feature.

A single, stateless, once-a-day job is a poor fit for a persistent job store
(APScheduler + a Postgres jobstore, as MJH's discovery scheduler uses) — there
is nothing to persist, since each run recomputes month-to-date costs from
scratch. So this is a plain asyncio background task: zero extra dependency,
and it self-heals on restart (the startup catch-up run repopulates the object).

Lifecycle — started ONLY on the primary app (``settings.transparency_primary``)
and wired via that app's FastAPI ``on_startup`` / ``on_shutdown`` hooks (PR3),
NOT by the shared lifespan factory (which stays free of a ``core → services``
import). Non-primary apps never start it.

Cadence: one catch-up run a few moments after startup (so a fresh deploy fills
the shared object immediately), then daily at ~00:15 UTC — just after month
rollover, so a new month's costs appear within minutes instead of waiting up to
a day. A failed run logs + is retried on the next cycle; it never tears down the
loop and never overwrites a good figure with a zero (see ``cost_sync``).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from platform_shared.services.transparency import cost_sync

logger = logging.getLogger(__name__)

# Run the daily sync just after midnight UTC so a new month's costs populate
# promptly at rollover.
_DAILY_RUN_HOUR = 0
_DAILY_RUN_MINUTE = 15

# Module-level singleton task — a process runs at most one cost-sync loop.
# Populated by ``maybe_start_transparency_sync``, cleared by ``stop_transparency_sync``.
_task: asyncio.Task[None] | None = None


def _seconds_until_next_run(now: datetime) -> float:
    """Seconds from ``now`` until the next ``HH:MM`` UTC daily slot."""
    target = now.replace(
        hour=_DAILY_RUN_HOUR, minute=_DAILY_RUN_MINUTE, second=0, microsecond=0,
    )
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


async def _run_once(settings: Any) -> None:
    """Run one cost sync, swallowing transient errors.

    The loop must never die on a failed run (Anthropic outage, MinIO blip):
    log at ERROR with the traceback (captured by Sentry where wired) and leave
    the previously stored figure intact until the next cycle.
    """
    try:
        await cost_sync.run_cost_sync(settings)
    except Exception:  # noqa: BLE001 — a daily job must not propagate / die
        logger.exception("Transparency cost sync failed; will retry next cycle")


async def _daily_loop(settings: Any) -> None:
    """Catch-up once at startup, then run daily at the configured UTC slot."""
    await _run_once(settings)
    while True:
        await asyncio.sleep(_seconds_until_next_run(datetime.now(timezone.utc)))
        await _run_once(settings)


def maybe_start_transparency_sync(settings: Any) -> asyncio.Task[None] | None:
    """Start the daily cost-sync loop iff this app is the primary writer.

    Returns the created task (so the caller can hold a reference), or ``None``
    when ``transparency_primary`` is false — the no-op path for every read-only
    app. Idempotent: returns the existing task if one is already running.

    Must be called from within a running event loop (the FastAPI ``on_startup``
    hook satisfies this).
    """
    global _task
    if not getattr(settings, "transparency_primary", False):
        return None
    if _task is not None and not _task.done():
        return _task
    _task = asyncio.create_task(_daily_loop(settings), name="transparency-cost-sync")
    logger.info("Transparency cost-sync loop started (primary app)")
    return _task


async def stop_transparency_sync() -> None:
    """Cancel the cost-sync loop if running. Idempotent; safe on non-primary apps."""
    global _task
    if _task is not None and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        logger.info("Transparency cost-sync loop stopped")
    _task = None


__all__ = [
    "maybe_start_transparency_sync",
    "stop_transparency_sync",
]
