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
row the worker raises ``SchedulerReconcileFailingError`` and exits
non-zero: Docker does not restart a merely unhealthy container, but
``restart: unless-stopped`` does restart an exited one, and the restart
re-runs the boot checks.

SIGTERM / SIGINT stop the loop and shut the scheduler down cleanly.
"""
from __future__ import annotations

import asyncio
import logging
import signal

from platform_shared.core.logging_safety import install_crlf_safe_logging

from app.core.config import settings
from app.core.discovery_scheduler_constants import (
    HEARTBEAT_PATH,
    MAX_CONSECUTIVE_RECONCILE_FAILURES,
    RECONCILE_INTERVAL_SECONDS,
)
from app.core.heartbeat import clear_heartbeat, touch_heartbeat
from app.core.observability import init_sentry
from app.db.scheduler_jobstore import build_scheduler_jobstore
from app.db.session import AsyncSessionLocal, engine
from app.services.discovery import (
    discovery_embedding_service,
    discovery_scheduler_service,
)

logger = logging.getLogger(__name__)


class SchedulerReconcileFailingError(RuntimeError):
    """Reconcile failed too many times in a row — exit so Docker restarts us."""


async def reconcile_once() -> None:
    """One reconcile pass in its own session, then a heartbeat."""
    async with AsyncSessionLocal() as db:
        result = await discovery_scheduler_service.reconcile_source_jobs(db)
    if result.changed:
        logger.info(
            "discovery scheduler reconcile: +%d ~%d -%d (%d active sources)",
            result.added, result.rescheduled, result.removed, result.active_sources,
        )
    touch_heartbeat(HEARTBEAT_PATH)


async def _wait_or_stop(stop: asyncio.Event, timeout: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=timeout)
    except TimeoutError:
        pass


async def run_scheduler(stop: asyncio.Event) -> None:
    """Boot the scheduler, reconcile until ``stop`` is set, then shut down."""
    clear_heartbeat(HEARTBEAT_PATH)
    init_sentry()
    discovery_embedding_service.load_model_eager()
    jobstore = build_scheduler_jobstore(settings.database_url_sync)
    discovery_scheduler_service.start_scheduler(jobstore)
    try:
        await reconcile_once()
        logger.info(
            "discovery scheduler running — reconciling every %ds",
            RECONCILE_INTERVAL_SECONDS,
        )
        failures = 0
        while not stop.is_set():
            await _wait_or_stop(stop, RECONCILE_INTERVAL_SECONDS)
            if stop.is_set():
                break
            try:
                await reconcile_once()
            except Exception as exc:  # noqa: BLE001 — bounded retry, then exit
                failures += 1
                logger.exception(
                    "discovery scheduler reconcile failed (%d/%d in a row)",
                    failures, MAX_CONSECUTIVE_RECONCILE_FAILURES,
                )
                if failures >= MAX_CONSECUTIVE_RECONCILE_FAILURES:
                    raise SchedulerReconcileFailingError(
                        f"reconcile failed {failures} times in a row",
                    ) from exc
            else:
                failures = 0
    finally:
        discovery_scheduler_service.shutdown_scheduler()
        await engine.dispose()
        logger.info("discovery scheduler stopped")


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    signals = (signal.SIGTERM, signal.SIGINT)
    for sig in signals:
        loop.add_signal_handler(sig, stop.set)
    try:
        await run_scheduler(stop)
    finally:
        for sig in signals:
            loop.remove_signal_handler(sig)


def run() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    install_crlf_safe_logging()
    asyncio.run(main())


if __name__ == "__main__":
    run()
