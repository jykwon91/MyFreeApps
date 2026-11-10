"""The scheduler's job bodies — what each job registered by ``scheduler_service`` runs.

Every job catches and logs its own failure, so one bad run never unschedules
it; the next run retries. They run only in the scheduler process
(``app/workers/scheduler_worker.py``).
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories.game.source_repo import list_sources
from app.services.ingestion import ingestion_orchestrator
from app.services.wow import raid_notification_worker
from app.services.wow.feature_requests import feature_retention_service
from app.services.wow.prices import price_refresh_service
from app.services.wow.server_status import server_status_history_service

logger = logging.getLogger(__name__)


async def run_sync_all_sources() -> None:
    """Sync every active source, one at a time.

    Sequential (not parallel) to avoid saturating the download dir or
    hitting YouTube rate limits simultaneously. Sources marked deleted via
    config_json["deleted"] == true are skipped; a source with no
    config_json is treated as active.
    """
    logger.info("scheduler_service: sync_all_sources: starting")
    async with AsyncSessionLocal() as db:
        sources = await list_sources(db)

    synced = 0
    skipped = 0
    errors = 0

    for source in sources:
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
                stats = await ingestion_orchestrator.sync_source(source.id, db)
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


async def run_raid_notifications() -> None:
    """Send due raid-bot notifications (registered only when DISCORD_ENABLED)."""
    try:
        await raid_notification_worker.process_due_notifications()
    except Exception:
        # process_due_notifications never raises by design; belt and braces so
        # one bad tick can't kill the job.
        logger.exception("scheduler_service: raid_notifications: run failed")


async def run_refresh_wow_prices() -> None:
    """Refresh WoW Forever auction-house prices."""
    try:
        outcomes = await price_refresh_service.refresh_all()
    except Exception:
        logger.exception("scheduler_service: refresh_wow_prices: run failed")
        return
    logger.info(
        "scheduler_service: refresh_wow_prices: %s",
        ", ".join(f"{o.label}={o.outcome}({o.item_count})" for o in outcomes) or "nothing refreshed",
    )


async def run_record_server_status() -> None:
    """Record WoW Forever server status changes."""
    try:
        outcomes = await server_status_history_service.record_all()
    except Exception:
        logger.exception("scheduler_service: record_wow_server_status: run failed")
        return
    logger.info(
        "scheduler_service: record_wow_server_status: %s",
        ", ".join(f"{o.region}={o.outcome}({o.written})" for o in outcomes),
    )


async def run_purge_server_status_history() -> None:
    """WoW Forever server status retention."""
    try:
        await server_status_history_service.purge_old()
    except Exception:
        # Retried on the next run; logged so a persistent failure is visible.
        logger.exception("scheduler_service: purge_wow_server_status_history: run failed")


async def run_purge_feature_submissions() -> None:
    """WoW feature-request retention."""
    try:
        await feature_retention_service.purge_feature_request_data()
    except Exception:
        # Retried on the next run; logged so a persistent failure is visible.
        logger.exception("scheduler_service: purge_wow_feature_submissions: run failed")


async def run_cleanup_downloads() -> None:
    """Enforce the INGESTION_DOWNLOAD_DIR_MAX_GB disk cap on the download dir.

    Deletes the oldest files (by mtime) until the total is under the cap,
    logging each deletion. The intent is to catch interrupted downloads that
    were never cleaned up — each sync_source() call removes its own file after
    processing, so this is a safety net. It covers the scheduler container's
    own download dir, where scheduled syncs download; an on-demand
    ``POST /api/sources/{id}/sync`` downloads inside the api container, whose
    /tmp is discarded each time the container is recreated.
    """
    download_dir = Path(settings.ingestion_download_dir)
    max_bytes = settings.ingestion_download_dir_max_gb * 1024 * 1024 * 1024

    if not download_dir.exists():
        logger.debug(
            "scheduler_service: cleanup_downloads: dir does not exist: %s", download_dir,
        )
        return

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
