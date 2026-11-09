"""APScheduler wiring for scheduled source syncs (PR 6).

Scheduled jobs:
  sync_all_sources  — every SOURCE_SYNC_INTERVAL_HOURS hours (default 6).
                      Iterates active sources and calls sync_source() for each
                      sequentially (rate-limit-safe). Skips sources marked
                      deleted via config_json["deleted"] == true.
  cleanup_ingestion_downloads — every 1 hour. Enforces the
                      INGESTION_DOWNLOAD_DIR_MAX_GB cap by deleting oldest
                      files first. Prevents unbounded disk growth from
                      interrupted downloads.
  raid_notifications — every 60 seconds, only when DISCORD_ENABLED=true.
                      Drains the WoW raid bot's notification outbox
                      (``app/services/wow/raid_notification_worker.py``).
                      Safe with several processes ticking at once: the
                      outbox is claimed with FOR UPDATE SKIP LOCKED.
  refresh_wow_prices — every WOW_PRICE_REFRESH_INTERVAL_HOURS hours (default
                      3) and once at boot. Pulls WoW Forever auction-house
                      prices from Blizzard (``app/services/wow/prices/``); a per-game
                      advisory lock keeps two processes from both writing.
  purge_wow_feature_submissions — every 24 hours. WoW feature-request
                      retention (``feature_retention_service``).
  record_wow_server_status — every 5 minutes and once at boot: WoW Forever
                      server status changes + hourly checkpoints, per-region
                      advisory lock (``app/services/wow/server_status/``).
  purge_wow_server_status_history — every 24 hours (rows older than 90 days).

Switches: the purges always run. SCHEDULER_ENABLED gates sync_all_sources,
cleanup_ingestion_downloads and raid_notifications (serve-only prod turns it
off). WOW_PRICE_REFRESH_ENABLED gates refresh_wow_prices.
WOW_SERVER_STATUS_RECORDING_ENABLED gates record_wow_server_status.

Architecture rationale
----------------------
Single-VPS, single-process FastAPI app with a small, fixed set of sources.
APScheduler in-process is the right shape — no multi-process coordination
needed, no external queue surface.

Mirrors apps/myjobhunter/backend/app/services/discovery/discovery_scheduler_service.py
for all lifecycle patterns (singleton module-level scheduler, start/shutdown
helpers, fail-loud posture).

Monorepo parity note
--------------------
MGA is the second app with APScheduler. If MBK adds a scheduled job,
extract the scheduler factory to ``platform_shared.core.scheduler`` per
``rules/monorepo-parity-discipline.md`` auto-promote rule.

Failure mode posture
--------------------
Per ``rules/no-bandaid-solutions.md``: if the scheduler fails to start
(APScheduler error, Postgres unreachable) the lifespan must FAIL LOUDLY in
production. Silent degradation where syncs never run is worse than a boot
failure that is immediately visible.

When SCHEDULER_ENABLED=false the scheduler is not started — startup logs a
WARNING if sources exist so the operator knows syncs are disabled.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.wow_server_status import PURGE_INTERVAL_HOURS as SERVER_STATUS_PURGE_INTERVAL_HOURS
from app.core.wow_server_status import RECORD_INTERVAL as SERVER_STATUS_RECORD_INTERVAL
from app.services.wow.prices import price_refresh_service
from app.services.wow.server_status import server_status_history_service
from app.core.wow_feature_request_limits import PURGE_INTERVAL_HOURS
from app.services.wow.feature_requests.feature_retention_service import purge_feature_request_data

logger = logging.getLogger(__name__)

# Module-level singleton. Populated by start_scheduler(), consumed by
# shutdown_scheduler(). A process-wide singleton — there is no legitimate
# use case for two AsyncIOScheduler instances in one process.
_scheduler: AsyncIOScheduler | None = None

# Job name constants — used by both the scheduler wiring and admin API.
JOB_SYNC_ALL_SOURCES = "sync_all_sources"
JOB_CLEANUP_DOWNLOADS = "cleanup_ingestion_downloads"
JOB_RAID_NOTIFICATIONS = "raid_notifications"
JOB_REFRESH_WOW_PRICES = "refresh_wow_prices"
JOB_PURGE_FEATURE_SUBMISSIONS = "purge_wow_feature_submissions"
JOB_RECORD_SERVER_STATUS = "record_wow_server_status"
JOB_PURGE_SERVER_STATUS = "purge_wow_server_status_history"
RAID_NOTIFICATIONS_INTERVAL_SECONDS = 60


class SchedulerNotStartedError(RuntimeError):
    """Raised when the scheduler is accessed before start_scheduler() is called."""


def start_scheduler(
    sync_interval_hours: int = 6,
    price_refresh_interval_hours: int = 3,
    *,
    source_jobs: bool = True,
    price_refresh: bool = True,
    server_status_recording: bool = True,
) -> AsyncIOScheduler:
    """Initialize the module-level AsyncIOScheduler and register jobs.

    The feature-request retention purge always runs. Two more groups of jobs
    each have a switch:

    * ``source_jobs`` (``SCHEDULER_ENABLED``) — YouTube source sync, download
      cleanup and the Discord raid reminders. Serve-only prod turns these off.
    * ``price_refresh`` (``WOW_PRICE_REFRESH_ENABLED``) — the WoW Forever
      auction-house prices. A read-only fetch of a public file, so it stays on
      in serve-only prod, where the public price API needs it.
    * ``server_status_recording`` (``WOW_SERVER_STATUS_RECORDING_ENABLED``) —
      the WoW Forever server status history. Same reasoning as prices.

    Uses an in-memory job store (no DB required) — jobs are re-registered
    on every start from settings, so state is always fresh. Unlike MJH's
    discovery scheduler (which needs per-source intervals from the DB), MGA's
    jobs are fixed-interval global passes.

    Idempotent: if already started, returns the existing scheduler.

    Raises:
        Any APScheduler startup error. The caller (lifespan) does NOT swallow
        these — failure to start the scheduler must fail the lifespan loudly
        per ``rules/no-bandaid-solutions.md``.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _add_retention_jobs(_scheduler)
    if source_jobs:
        _add_source_jobs(_scheduler, sync_interval_hours)
    if price_refresh:
        _add_price_refresh_job(_scheduler, price_refresh_interval_hours)
    if server_status_recording:
        _add_server_status_job(_scheduler)

    _scheduler.start()
    logger.info(
        "scheduler_service: started — source_jobs=%s sync_interval_hours=%d "
        "price_refresh=%s price_refresh_interval_hours=%d server_status_recording=%s",
        source_jobs, sync_interval_hours, price_refresh, price_refresh_interval_hours, server_status_recording,
    )
    return _scheduler


def _add_source_jobs(scheduler: AsyncIOScheduler, sync_interval_hours: int) -> None:
    scheduler.add_job(
        _run_sync_all_sources,
        trigger=IntervalTrigger(hours=sync_interval_hours),
        id=JOB_SYNC_ALL_SOURCES,
        name="sync_all_sources",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,  # 1h grace — syncs are not time-critical
        max_instances=1,
    )

    scheduler.add_job(
        _run_cleanup_downloads,
        trigger=IntervalTrigger(hours=1),
        id=JOB_CLEANUP_DOWNLOADS,
        name="cleanup_ingestion_downloads",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=1800,
        max_instances=1,
    )

    from app.core.config import settings

    if settings.discord_enabled:
        scheduler.add_job(
            _run_raid_notifications,
            trigger=IntervalTrigger(seconds=RAID_NOTIFICATIONS_INTERVAL_SECONDS),
            id=JOB_RAID_NOTIFICATIONS,
            name="raid_notifications",
            replace_existing=True,
            coalesce=True,
            misfire_grace_time=RAID_NOTIFICATIONS_INTERVAL_SECONDS,
            max_instances=1,
        )


def _add_retention_jobs(scheduler: AsyncIOScheduler) -> None:
    # A promise to the people who submit data, so it has no switch: it runs
    # wherever the scheduler runs, serve-only prod included.
    scheduler.add_job(
        _run_purge_feature_submissions,
        trigger=IntervalTrigger(hours=PURGE_INTERVAL_HOURS),
        id=JOB_PURGE_FEATURE_SUBMISSIONS,
        name=JOB_PURGE_FEATURE_SUBMISSIONS,
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        max_instances=1,
    )
    scheduler.add_job(
        _run_purge_server_status_history,
        trigger=IntervalTrigger(hours=SERVER_STATUS_PURGE_INTERVAL_HOURS),
        id=JOB_PURGE_SERVER_STATUS,
        name=JOB_PURGE_SERVER_STATUS,
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        max_instances=1,
    )


def _add_server_status_job(scheduler: AsyncIOScheduler) -> None:
    interval_seconds = int(SERVER_STATUS_RECORD_INTERVAL.total_seconds())
    scheduler.add_job(
        _run_record_server_status,
        trigger=IntervalTrigger(seconds=interval_seconds),
        id=JOB_RECORD_SERVER_STATUS,
        name=JOB_RECORD_SERVER_STATUS,
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=interval_seconds,
        max_instances=1,
        # Also once at boot, so a deploy's restart leaves no extra gap.
        next_run_time=datetime.now(timezone.utc),
    )


def _add_price_refresh_job(scheduler: AsyncIOScheduler, interval_hours: int) -> None:
    scheduler.add_job(
        _run_refresh_wow_prices,
        trigger=IntervalTrigger(hours=interval_hours),
        id=JOB_REFRESH_WOW_PRICES,
        name="refresh_wow_prices",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        max_instances=1,
        # Also once at boot, so a fresh deploy has prices without waiting hours.
        next_run_time=datetime.now(timezone.utc),
    )


def shutdown_scheduler() -> None:
    """Stop the scheduler. Idempotent; safe to call multiple times.

    Called from the FastAPI lifespan shutdown hook. ``wait=False`` so a
    long-running sync doesn't block the process from exiting.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_service: shut down")
    _scheduler = None


def get_scheduler() -> AsyncIOScheduler | None:
    """Return the current scheduler instance, or None if not started."""
    return _scheduler


def _require_scheduler() -> AsyncIOScheduler:
    if _scheduler is None or not _scheduler.running:
        raise SchedulerNotStartedError(
            "scheduler_service: scheduler not started — "
            "call start_scheduler() from the FastAPI lifespan first",
        )
    return _scheduler


def get_job_status() -> list[dict]:
    """Return a list of job status dicts for the admin API.

    Returns an empty list if the scheduler is not started.
    """
    if _scheduler is None or not _scheduler.running:
        return []

    jobs = []
    for job in _scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run_at": next_run.isoformat() if next_run else None,
            "trigger": str(job.trigger),
        })
    return jobs


async def trigger_job(job_id: str) -> bool:
    """Manually trigger a job by id. Returns True if triggered, False if not found.

    Sets next_run_time to now so APScheduler fires it at the next wakeup cycle
    (typically within 1 second). Does not block waiting for the job to complete.
    """
    scheduler = _require_scheduler()
    job = scheduler.get_job(job_id)
    if job is None:
        return False
    job.modify(next_run_time=datetime.now(timezone.utc))
    return True


# ---------------------------------------------------------------------------
# Job implementations
# ---------------------------------------------------------------------------

async def _run_sync_all_sources() -> None:
    """Scheduled job: iterate all active sources and sync each sequentially.

    Sequential (not parallel) to avoid saturating the download dir or
    hitting YouTube rate limits simultaneously.

    Sources marked deleted via config_json["deleted"] == true are skipped.
    A source with no config_json is treated as active.
    """
    from app.db.session import AsyncSessionLocal
    from app.repositories.game.source_repo import list_sources
    from app.services.ingestion.ingestion_orchestrator import sync_source

    logger.info("scheduler_service: sync_all_sources: starting")
    async with AsyncSessionLocal() as db:
        sources = await list_sources(db)

    synced = 0
    skipped = 0
    errors = 0

    for source in sources:
        # Skip sources marked deleted in config_json
        config = source.config_json or {}
        if config.get("deleted") is True:
            logger.debug(
                "scheduler_service: sync_all_sources: skipping deleted source=%s",
                source.id,
            )
            skipped += 1
            continue

        logger.info(
            "scheduler_service: sync_all_sources: syncing source=%s kind=%s",
            source.id, source.kind,
        )
        try:
            async with AsyncSessionLocal() as db:
                stats = await sync_source(source.id, db)
            synced += 1
            logger.info(
                "scheduler_service: sync_all_sources: source=%s done "
                "videos=%d chapters=%d errors=%d",
                source.id, stats.video_count, stats.chapter_count, stats.error_count,
            )
        except Exception:
            errors += 1
            logger.exception(
                "scheduler_service: sync_all_sources: source=%s FAILED", source.id,
            )

    logger.info(
        "scheduler_service: sync_all_sources: complete "
        "synced=%d skipped=%d errors=%d",
        synced, skipped, errors,
    )


async def _run_raid_notifications() -> None:
    """Scheduled job: send due raid-bot notifications (no-op unless DISCORD_ENABLED)."""
    from app.services.wow.raid_notification_worker import process_due_notifications

    try:
        await process_due_notifications()
    except Exception:
        # process_due_notifications never raises by design; belt and braces so
        # one bad tick can't kill the job.
        logger.exception("scheduler_service: raid_notifications: run failed")


async def _run_refresh_wow_prices() -> None:
    """Scheduled job: refresh WoW Forever auction-house prices."""
    try:
        outcomes = await price_refresh_service.refresh_all()
    except Exception:
        logger.exception("scheduler_service: refresh_wow_prices: run failed")
        return
    logger.info(
        "scheduler_service: refresh_wow_prices: %s",
        ", ".join(f"{o.region}/{o.faction}={o.outcome}({o.item_count})" for o in outcomes) or "nothing refreshed",
    )

async def _run_record_server_status() -> None:
    """Scheduled job: record WoW Forever server status changes."""
    try:
        outcomes = await server_status_history_service.record_all()
    except Exception:
        logger.exception("scheduler_service: record_wow_server_status: run failed")
        return
    logger.info(
        "scheduler_service: record_wow_server_status: %s",
        ", ".join(f"{o.region}={o.outcome}({o.written})" for o in outcomes),
    )


async def _run_purge_server_status_history() -> None:
    """Scheduled job: WoW Forever server status retention."""
    try:
        await server_status_history_service.purge_old()
    except Exception:
        # Retried on the next tick; logged so a persistent failure is visible.
        logger.exception("scheduler_service: purge_wow_server_status_history: run failed")


async def _run_purge_feature_submissions() -> None:
    """Scheduled job: WoW feature-request retention."""
    try:
        await purge_feature_request_data()
    except Exception:
        # Retried on the next tick; logged so a persistent failure is visible.
        logger.exception("scheduler_service: purge_wow_feature_submissions: run failed")


async def _run_cleanup_downloads() -> None:
    """Scheduled job: enforce INGESTION_DOWNLOAD_DIR_MAX_GB disk cap.

    Calculates the total size of files in the download dir. If it exceeds
    the cap, deletes the oldest files (by mtime) until the total is under
    the cap. Logs each deletion with path + size.

    Files actively being downloaded (very recent mtime) are not immune from
    deletion by this logic — the intent is to catch interrupted downloads
    that were never cleaned up. In practice, each sync_source() call cleans
    up its own file after processing; this job is a safety net.
    """
    from app.core.config import settings

    download_dir = Path(settings.ingestion_download_dir)
    max_bytes = settings.ingestion_download_dir_max_gb * 1024 * 1024 * 1024

    if not download_dir.exists():
        logger.debug(
            "scheduler_service: cleanup_downloads: dir does not exist: %s", download_dir,
        )
        return

    # Collect all files with their sizes and mtimes
    files: list[tuple[float, int, Path]] = []  # (mtime, size_bytes, path)
    total_bytes = 0
    try:
        for entry in download_dir.iterdir():
            if entry.is_file():
                stat = entry.stat()
                files.append((stat.st_mtime, stat.st_size, entry))
                total_bytes += stat.st_size
    except OSError as exc:
        logger.error(
            "scheduler_service: cleanup_downloads: failed to scan dir=%s error=%s",
            download_dir, str(exc),
        )
        return

    total_gb = total_bytes / (1024 ** 3)
    logger.info(
        "scheduler_service: cleanup_downloads: dir=%s total=%.2fGB cap=%.2fGB files=%d",
        download_dir, total_gb, settings.ingestion_download_dir_max_gb, len(files),
    )

    if total_bytes <= max_bytes:
        return

    # Sort oldest first — delete until under cap
    files.sort(key=lambda x: x[0])
    deleted_count = 0
    freed_bytes = 0

    for _mtime, size, path in files:
        if total_bytes <= max_bytes:
            break
        try:
            path.unlink(missing_ok=True)
            total_bytes -= size
            freed_bytes += size
            deleted_count += 1
            logger.info(
                "scheduler_service: cleanup_downloads: deleted path=%s size=%d",
                path, size,
            )
        except OSError as exc:
            logger.warning(
                "scheduler_service: cleanup_downloads: failed to delete path=%s error=%s",
                path, str(exc),
            )

    logger.info(
        "scheduler_service: cleanup_downloads: freed %.2fMB in %d files",
        freed_bytes / (1024 * 1024), deleted_count,
    )
