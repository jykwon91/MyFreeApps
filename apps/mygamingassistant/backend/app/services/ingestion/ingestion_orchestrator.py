"""Ingestion orchestrator — coordinate YouTube fetch + chapter parse + frame extract.

Pipeline per source sync:
  1. List video metadata via yt-dlp (no download yet).
  2. Filter to videos not already in the lineup table (dedup by youtube_video_id).
  3. For each new video:
     a. Download video to INGESTION_DOWNLOAD_DIR.
     b. Parse chapter timestamps (native yt-dlp or description regex).
     c. For each chapter: extract stand frame (t=start) + aim frame (t=start+4s).
     d. Upload both frames to MinIO under pending/{video_id}/{start}-{stand|aim}.png.
     e. Insert Lineup row with status='pending_review'.
     f. Delete downloaded video.
  4. Update source.last_synced_at + last_sync_stats.

Error handling:
  - A failure on one chapter skips that chapter and continues.
  - A failure on one video (download or all chapters) skips that video and continues.
  - A failure listing videos (yt-dlp network error) aborts the sync.
  - All errors are logged at ERROR with structured context and captured by Sentry.

run_sync() is designed to run as a FastAPI BackgroundTask (PR 4). PR 6 replaces
this with an APScheduler job.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_storage
from app.models.game.source import Source
from app.repositories.game import lineup_repo, source_repo
from app.schemas.game.lineup_schemas import LineupIngestCreate
from app.services.game import lineup_service
from app.services.ingestion.chapter_parser import Chapter, parse_chapters
from app.services.ingestion.frame_extractor import FrameExtractionError, extract_frames
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    VideoMeta,
    YouTubeFetchError,
    download_video,
    list_videos,
)

logger = logging.getLogger(__name__)


@dataclass
class SyncStats:
    source_id: uuid.UUID
    video_count: int = 0
    chapter_count: int = 0
    error_count: int = 0
    errors: list[str] = field(default_factory=list)


def _pending_screenshot_key(video_id: str, start_seconds: int, slot: str) -> str:
    """MinIO key for a pending (unclassified) lineup screenshot.

    Format: pending/{video_id}/{start_seconds}-{slot}.png
    Slot: "stand" or "aim"
    """
    return f"pending/{video_id}/{start_seconds}-{slot}.png"


def _upload_frame(storage, key: str, png_bytes: bytes) -> None:
    """Upload PNG bytes to MinIO.

    Uses the internal client directly since these are server-side uploads
    (not presigned PUTs). The object is written with content-type image/png.
    """
    from minio.error import S3Error

    client = storage._client if hasattr(storage, "_client") else storage
    client.put_object(
        storage.bucket,
        key,
        data=BytesIO(png_bytes),
        length=len(png_bytes),
        content_type="image/png",
    )


async def _process_chapter(
    video_meta: VideoMeta,
    chapter: Chapter,
    download_dir: Path,
    video_path: Path,
    db: AsyncSession,
    source: Source,
) -> bool:
    """Extract frames, upload to MinIO, and create a Lineup row.

    Returns True on success, False on any handled error.
    """
    start = chapter.start_seconds
    aim_ts = min(float(start) + 4.0, float(chapter.end_seconds) - 0.5)
    aim_ts = max(aim_ts, float(start))  # guard against end < start + 0.5

    try:
        stand_bytes, aim_bytes = await extract_frames(video_path, [float(start), aim_ts])
    except FrameExtractionError as exc:
        logger.error(
            "Frame extraction failed: source_id=%s video_id=%s chapter_start=%d error=%s",
            source.id, video_meta.video_id, start, str(exc),
            exc_info=True,
        )
        sentry_sdk.capture_exception(exc)
        return False

    stand_key = _pending_screenshot_key(video_meta.video_id, start, "stand")
    aim_key = _pending_screenshot_key(video_meta.video_id, start, "aim")

    try:
        storage = get_storage()
        _upload_frame(storage, stand_key, stand_bytes)
        _upload_frame(storage, aim_key, aim_bytes)
    except Exception as exc:
        logger.error(
            "MinIO upload failed: source_id=%s video_id=%s chapter_start=%d error=%s",
            source.id, video_meta.video_id, start, str(exc),
            exc_info=True,
        )
        sentry_sdk.capture_exception(exc)
        return False

    payload = LineupIngestCreate(
        source_id=source.id,
        title=chapter.title,
        youtube_video_id=video_meta.video_id,
        chapter_start_seconds=start,
        chapter_title=chapter.title,
        stand_screenshot_url=stand_key,
        aim_screenshot_url=aim_key,
        attribution_url=video_meta.url,
        attribution_author=video_meta.channel_name,
    )

    try:
        await lineup_service.create_from_ingestion(db, payload)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error(
            "DB insert failed: source_id=%s video_id=%s chapter_start=%d error=%s",
            source.id, video_meta.video_id, start, str(exc),
            exc_info=True,
        )
        sentry_sdk.capture_exception(exc)
        return False

    return True


async def _process_video(
    video_meta: VideoMeta,
    download_dir: Path,
    db: AsyncSession,
    source: Source,
    stats: SyncStats,
) -> None:
    """Download a video, parse chapters, and create lineup rows."""
    logger.info(
        "Processing video: source_id=%s video_id=%s title=%r",
        source.id, video_meta.video_id, video_meta.title,
    )

    # Download
    try:
        video_path = await download_video(video_meta.video_id, download_dir)
    except VideoDownloadError as exc:
        logger.error(
            "Video download failed: source_id=%s video_id=%s error_type=%s message=%s",
            source.id, video_meta.video_id, exc.error_type, str(exc),
        )
        sentry_sdk.capture_exception(exc)
        stats.error_count += 1
        stats.errors.append(f"{video_meta.video_id}: download failed ({exc.error_type})")
        return

    try:
        chapters = parse_chapters(
            description=video_meta.description,
            video_duration=video_meta.duration,
            native_chapters=video_meta.chapters or None,
        )

        if not chapters:
            logger.info(
                "No chapters found: source_id=%s video_id=%s — skipping",
                source.id, video_meta.video_id,
            )
            return

        logger.info(
            "Found %d chapters: source_id=%s video_id=%s",
            len(chapters), source.id, video_meta.video_id,
        )

        for chapter_idx, chapter in enumerate(chapters):
            ok = await _process_chapter(
                video_meta=video_meta,
                chapter=chapter,
                download_dir=download_dir,
                video_path=video_path,
                db=db,
                source=source,
            )
            if ok:
                stats.chapter_count += 1
            else:
                stats.error_count += 1
                stats.errors.append(
                    f"{video_meta.video_id}[{chapter_idx}]: chapter processing failed"
                )

        stats.video_count += 1

    finally:
        # Always clean up the downloaded file regardless of success/failure.
        try:
            video_path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning(
                "Failed to delete downloaded video: path=%s error=%s",
                video_path, str(exc),
            )


async def sync_source(source_id: uuid.UUID, db: AsyncSession) -> SyncStats:
    """Run a full sync for one Source.

    This is designed to run as a FastAPI BackgroundTask (PR 4). PR 6 replaces
    this with an APScheduler background scheduler.

    Per-video errors are caught and logged; the sync continues past them.
    A yt-dlp error when listing videos is fatal for this sync run.

    Returns SyncStats with counts and error summaries.
    """
    stats = SyncStats(source_id=source_id)
    source = await source_repo.get_source(db, source_id)
    if source is None:
        logger.error("sync_source: source not found: source_id=%s", source_id)
        return stats

    logger.info("sync_source: starting: source_id=%s kind=%s", source.id, source.kind)

    download_dir = Path(settings.ingestion_download_dir)

    # List videos
    try:
        video_metas: list[VideoMeta] = await list_videos(source)
    except YouTubeFetchError as exc:
        logger.error(
            "sync_source: failed to list videos: source_id=%s error_type=%s message=%s",
            source.id, exc.error_type, str(exc),
        )
        sentry_sdk.capture_exception(exc)
        stats.errors.append(f"list_videos failed: {exc.error_type}: {exc}")
        stats.error_count += 1
        return stats

    if not video_metas:
        logger.info("sync_source: no videos found: source_id=%s", source.id)
        await source_repo.update_sync_stats(db, source, video_count=0, chapter_count=0, error_count=0)
        await db.commit()
        return stats

    # Dedup — filter to videos not already in the lineup table.
    all_video_ids = [m.video_id for m in video_metas]
    existing_ids = await lineup_repo.get_ingested_video_ids(db, all_video_ids)
    new_videos = [m for m in video_metas if m.video_id not in existing_ids]

    logger.info(
        "sync_source: %d total videos, %d new: source_id=%s",
        len(video_metas), len(new_videos), source.id,
    )

    for video_meta in new_videos:
        await _process_video(
            video_meta=video_meta,
            download_dir=download_dir,
            db=db,
            source=source,
            stats=stats,
        )

    # Update source stats
    try:
        await source_repo.update_sync_stats(
            db,
            source,
            video_count=stats.video_count,
            chapter_count=stats.chapter_count,
            error_count=stats.error_count,
        )
        await db.commit()
    except Exception as exc:
        logger.error(
            "sync_source: failed to update sync stats: source_id=%s error=%s",
            source.id, str(exc),
            exc_info=True,
        )

    logger.info(
        "sync_source: complete: source_id=%s videos=%d chapters=%d errors=%d",
        source.id, stats.video_count, stats.chapter_count, stats.error_count,
    )
    return stats
