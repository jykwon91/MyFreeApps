"""Scheduler — the ONE process that runs APScheduler.

Run with:
    python -m app.workers.scheduler_worker

Deployed as the ``scheduler`` compose service (one replica). The API never
starts a scheduler: it runs ``uvicorn --workers 2``, and an in-memory
AsyncIOScheduler in each worker ran every job twice.

Boot (fail loud — any error exits non-zero and the deploy's healthcheck
gate fails):
  1. Prices guard: production + WOW_PRICE_REFRESH_ENABLED=true needs the
     Blizzard credentials (only the price job uses them).
  2. Discord guard + icon warm-up (raid reminders go out from here).
  3. Read each job's last reported next run from ``scheduler_job`` — raises
     if Postgres is unreachable or the migration has not run — and start
     the scheduler, resuming every job's cadence across the restart.
  4. The first tick (start requested runs, report every job).

Then every ``TICK_INTERVAL_SECONDS`` it syncs with ``scheduler_job`` and
touches the heartbeat file the container healthcheck reads. After
``MAX_CONSECUTIVE_TICK_FAILURES`` failed ticks in a row it exits non-zero so
``restart: unless-stopped`` restarts it (Docker never restarts a merely
unhealthy container).

SIGTERM / SIGINT stop the loop and shut the scheduler down cleanly. Before
it stops, it reports every job's next run one last time, so the next start
doesn't re-run a job that fired since the last tick.
"""
from __future__ import annotations

import asyncio
import logging

from platform_shared.workers.entrypoint import run_until_signalled, run_worker
from platform_shared.workers.heartbeat import clear_heartbeat
from platform_shared.workers.heartbeat_loop import run_heartbeat_loop

from app.core.blizzard_prices_guard import check_blizzard_prices_configured
from app.core.config import settings
from app.core.scheduler_constants import (
    HEARTBEAT_PATH,
    MAX_CONSECUTIVE_TICK_FAILURES,
    TICK_INTERVAL_SECONDS,
)
from app.db.session import engine
from app.services.discord.startup import start_discord
from app.services.scheduling import scheduler_service, scheduler_sync_service

logger = logging.getLogger(__name__)


async def tick() -> None:
    """One sync with ``scheduler_job``: start requested runs, report every job."""
    await scheduler_sync_service.sync_with_db()


async def _report_before_stopping() -> None:
    """One attempt at a final report; a failure is logged, never raised."""
    try:
        await scheduler_sync_service.write_snapshot()
    except Exception:  # noqa: BLE001 — shutting down either way; the next start resumes from the last tick
        logger.exception("scheduler: final report failed — the next start resumes from the last tick's report")


async def run_scheduler(stop: asyncio.Event) -> None:
    """Boot the scheduler, tick until ``stop`` is set, then shut down."""
    clear_heartbeat(HEARTBEAT_PATH)
    check_blizzard_prices_configured()
    start_discord()
    if not settings.scheduler_enabled:
        logger.warning(
            "scheduler: SCHEDULER_ENABLED=false — automatic source syncs and Discord raid "
            "reminders are disabled. Use POST /api/scheduler/trigger/sync_all_sources for "
            "manual syncs, or set SCHEDULER_ENABLED=true to re-enable.",
        )
    started = False
    try:
        resume = await scheduler_sync_service.load_resume_times()
        scheduler_service.start_scheduler(
            sync_interval_hours=settings.source_sync_interval_hours,
            price_refresh_interval_hours=settings.wow_price_refresh_interval_hours,
            source_jobs=settings.scheduler_enabled,
            price_refresh=settings.wow_price_refresh_enabled,
            server_status_recording=settings.wow_server_status_recording_enabled,
            raid_notifications=settings.discord_enabled,
            resume_from=resume,
        )
        started = True
        await run_heartbeat_loop(
            stop,
            tick,
            interval_seconds=TICK_INTERVAL_SECONDS,
            max_consecutive_failures=MAX_CONSECUTIVE_TICK_FAILURES,
            heartbeat_path=HEARTBEAT_PATH,
            label="scheduler",
        )
    finally:
        if started:
            await _report_before_stopping()
        scheduler_service.shutdown_scheduler()
        await engine.dispose()
        logger.info("scheduler stopped")


async def main() -> None:
    await run_until_signalled(run_scheduler)


def run() -> None:
    run_worker(main)


if __name__ == "__main__":
    run()
