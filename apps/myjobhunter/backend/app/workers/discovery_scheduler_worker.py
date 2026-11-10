"""Discovery scheduler — the ONE process that runs APScheduler.

Run with:
    python -m app.workers.discovery_scheduler_worker

Deployed as the ``scheduler`` compose service (one replica). The API never
starts a scheduler: it runs ``uvicorn --workers 2``, and APScheduler 3.x
cannot share a jobstore between schedulers. See
``app/services/discovery/discovery_scheduler_service.py`` for the design.

Boot (fail loud — any error exits non-zero and the deploy's healthcheck
gate fails):
  1. Sentry init (raises in production without a DSN).
  2. Eager-load the embedding model scheduled passes use.
  3. Build the jobstore — raises if Postgres is unreachable or the
     ``apscheduler_jobs`` migration has not been applied.
  4. Start the scheduler and run the first reconcile.

Then every ``RECONCILE_INTERVAL_SECONDS`` it reconciles jobs with
``discovery_sources`` and touches the heartbeat file the container
healthcheck reads. A reconcile that fails after boot (a DB blip) is logged
and retried next interval while existing jobs keep firing, without
advancing the heartbeat. After ``MAX_CONSECUTIVE_RECONCILE_FAILURES`` in a
row the worker raises ``WorkerTickFailingError`` and exits
non-zero: Docker does not restart a merely unhealthy container, but
``restart: unless-stopped`` does restart an exited one, and the restart
re-runs the boot checks.

SIGTERM / SIGINT stop the loop and shut the scheduler down cleanly.
"""
from __future__ import annotations

import asyncio
import logging

from platform_shared.workers.entrypoint import run_until_signalled, run_worker
from platform_shared.workers.heartbeat import clear_heartbeat
from platform_shared.workers.heartbeat_loop import run_heartbeat_loop

from app.core.config import settings
from app.core.discovery_scheduler_constants import (
    HEARTBEAT_PATH,
    MAX_CONSECUTIVE_RECONCILE_FAILURES,
    RECONCILE_INTERVAL_SECONDS,
)
from app.core.observability import init_sentry
from app.db.scheduler_jobstore import build_scheduler_jobstore
from app.db.session import AsyncSessionLocal, engine
from app.services.discovery import (
    discovery_embedding_service,
    discovery_scheduler_service,
)

logger = logging.getLogger(__name__)


async def reconcile_once() -> None:
    """One reconcile pass in its own session."""
    async with AsyncSessionLocal() as db:
        result = await discovery_scheduler_service.reconcile_source_jobs(db)
    if result.changed:
        logger.info(
            "discovery scheduler reconcile: +%d ~%d -%d (%d active sources)",
            result.added, result.rescheduled, result.removed, result.active_sources,
        )


async def run_scheduler(stop: asyncio.Event) -> None:
    """Boot the scheduler, reconcile until ``stop`` is set, then shut down."""
    clear_heartbeat(HEARTBEAT_PATH)
    init_sentry()
    discovery_embedding_service.load_model_eager()
    jobstore = build_scheduler_jobstore(settings.database_url_sync)
    discovery_scheduler_service.start_scheduler(jobstore)
    try:
        await run_heartbeat_loop(
            stop,
            reconcile_once,
            interval_seconds=RECONCILE_INTERVAL_SECONDS,
            max_consecutive_failures=MAX_CONSECUTIVE_RECONCILE_FAILURES,
            heartbeat_path=HEARTBEAT_PATH,
            label="discovery scheduler",
        )
    finally:
        discovery_scheduler_service.shutdown_scheduler()
        await engine.dispose()
        logger.info("discovery scheduler stopped")


async def main() -> None:
    await run_until_signalled(run_scheduler)


def run() -> None:
    run_worker(main)


if __name__ == "__main__":
    run()
