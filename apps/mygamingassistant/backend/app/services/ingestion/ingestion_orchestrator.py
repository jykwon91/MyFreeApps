"""Ingestion orchestrator — coordinate YouTube fetch + chapter parse + frame extract.

Pipeline per source sync:
  1. List video metadata via yt-dlp (no download yet).
  2. Filter to videos not already in the lineup table (dedup by youtube_video_id).
  3. For each new video:
     a. Download video to INGESTION_DOWNLOAD_DIR.
     b. Parse chapter timestamps (native yt-dlp or description regex).
     c. For each chapter (Strategy A): extract an evenly-spaced grid of
        candidate frames; the Claude classifier decides is_lineup and picks the
        best stand/aim frames. Chapters judged "not a lineup" are skipped with
        no row created.
     d. Upload the two Claude-chosen frames to MinIO under
        pending/{video_id}/{start}-{stand|aim}.png.
     e. Insert Lineup row with status='pending_review' + classifier suggestions.
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

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_storage
from app.models.game.source import Source
from app.repositories.game import lineup_repo, source_repo
from app.repositories.game.lineup_repo import write_classifier_suggestions
from app.schemas.game.lineup_schemas import LineupIngestCreate
from app.services.classification.classifier_service import (
    classify_frames_for_lineup_decision,
)
from app.services.game import lineup_service
from app.services.ingestion.chapter_parser import (
    Chapter,
    filter_lineup_chapters,
    parse_chapters,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    extract_frames,
    grid_timestamps,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    VideoMeta,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
    list_videos,
)

logger = logging.getLogger(__name__)

# Strategy A. The Phase-1 blind +3s/+7s frame-offset heuristic is GONE: a
# single arbitrary frame is exactly the input that left ingestion unable to
# reject junk chapters (see the g-debug-bug diagnosis). Instead we extract a
# grid of evenly-spaced candidate frames across the chapter and let the cheap
# Claude model both (a) decide is_lineup and (b) pick the best stand/aim frame.
#
# N is capped low so token cost stays bounded — a haiku call with 5 PNG frames
# is ≈7-9K image tokens (reference data + system prompt are cache_control'd, so
# billed once per game, not per chapter). _GRID_FRAME_COUNT is the only knob;
# do NOT raise it without re-checking the per-chapter cost note in the PR.
_GRID_FRAME_COUNT = 5

# Pulled off each chapter edge before the grid is spaced, so no candidate ever
# lands on the exact boundary (deterministic fade-in / title-card / black).
_GRID_EDGE_PADDING_SECONDS = 0.5

# Chapters the classifier judged a lineup but with confidence at/below this are
# treated as junk and skipped — a weak "maybe" is not worth a review-queue row.
_MIN_LINEUP_CONFIDENCE = 0.15


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


def _classifier_suggestion_fields(result) -> dict:
    """Map a ClassificationResult onto the lineup writeback dict.

    Same field set the legacy single-image path wrote via the repo, so the
    review UI sees identical columns regardless of which path classified it.
    """
    return {
        "aim_anchor_x": result.aim_anchor_x,
        "aim_anchor_y": result.aim_anchor_y,
        "suggested_game_id": result.suggested_game_id,
        "suggested_map_id": result.suggested_map_id,
        "suggested_target_zone_id": result.suggested_target_zone_id,
        "suggested_stand_zone_id": result.suggested_stand_zone_id,
        "suggested_side": result.suggested_side,
        "suggested_utility_type_id": result.suggested_utility_type_id,
        "classification_confidence": result.confidence,
        "classification_reasoning": result.reasoning,
    }


async def _process_chapter(
    video_meta: VideoMeta,
    chapter: Chapter,
    download_dir: Path,
    video_path: Path,
    db: AsyncSession,
    source: Source,
) -> bool:
    """Strategy A: grid-extract, let Claude detect+pick, then create the row.

    Flow:
      1. Extract ``_GRID_FRAME_COUNT`` evenly-spaced candidate frames strictly
         inside the chapter.
      2. Ask the classifier whether the chapter is a real lineup and which
         frames best show the stand/aim (ONE cheap-model call, before any DB
         write or MinIO upload).
      3. If ``is_lineup`` is False (or confidence too low), skip the chapter
         entirely — no pending row is created. This is the real "stop junk"
         mechanism. Dedup is keyed by ``youtube_video_id`` (whole video), not
         per-chapter, so skipping a chapter does not break re-sync dedup.
      4. Upload only the two Claude-chosen frames, create the lineup row, and
         write the classifier suggestions through the repo.

    Returns True when the chapter was handled successfully (including a
    deliberate "not a lineup" skip — that is a success, not an error). Returns
    False only on an unexpected handled failure (ffmpeg / MinIO / DB / API).
    """
    start = chapter.start_seconds

    timestamps = grid_timestamps(
        float(start),
        float(chapter.end_seconds),
        _GRID_FRAME_COUNT,
        edge_padding_seconds=_GRID_EDGE_PADDING_SECONDS,
    )

    try:
        frames = await extract_frames(video_path, timestamps)
    except FrameExtractionError as exc:
        logger.error(
            "Frame extraction failed: source_id=%s video_id=%s chapter_start=%d error=%s",
            source.id, video_meta.video_id, start, str(exc),
            exc_info=True,
        )
        return False

    if not frames:
        logger.error(
            "Frame grid empty: source_id=%s video_id=%s chapter_start=%d",
            source.id, video_meta.video_id, start,
        )
        return False

    game_hint = (
        source.config_json.get("game_hint") if source.config_json else None
    )

    # Strategy A core: the classifier IS the lineup detector + frame picker.
    # When the classifier is disabled we cannot make the is_lineup judgement,
    # so fall back to a defined behaviour: keep the chapter and use the first
    # and last grid frames as stand/aim (still strictly inside the chapter,
    # never the boundary). This keeps the classifier-disabled test/dev path
    # working without resurrecting the discredited +3s/+7s heuristic.
    classifier_ran = False
    result = None
    if settings.enable_classifier:
        try:
            result = await classify_frames_for_lineup_decision(
                db,
                frames=frames,
                chapter_title=chapter.title,
                attribution_author=video_meta.channel_name,
                game_hint=game_hint,
            )
            classifier_ran = True
        except Exception as exc:
            logger.error(
                "Grid classifier unexpected error (non-fatal): source_id=%s "
                "video_id=%s chapter_start=%d error=%s",
                source.id, video_meta.video_id, start, str(exc),
                exc_info=True,
            )

    if classifier_ran and result is not None:
        if not result.success:
            logger.warning(
                "Grid classifier call failed (non-fatal, skipping chapter): "
                "source_id=%s video_id=%s chapter_start=%d error_codes=%s",
                source.id, video_meta.video_id, start, result.error_codes,
            )
            # A failed classifier *call* (API/parse) — we cannot judge the
            # chapter. Skip it rather than create an unjudged junk row; the
            # whole point of Strategy A is to not ingest unverifiable frames.
            return True

        if not result.is_lineup or (
            result.confidence is not None
            and result.confidence <= _MIN_LINEUP_CONFIDENCE
        ):
            logger.info(
                "Chapter judged NOT a lineup — skipping (no row created): "
                "source_id=%s video_id=%s chapter_start=%d is_lineup=%s "
                "confidence=%.2f title=%r",
                source.id, video_meta.video_id, start, result.is_lineup,
                result.confidence or 0.0, chapter.title,
            )
            return True

        # Claude-selected best frames (1-based → 0-based). Fall back to
        # first/last if the model omitted an index (validation already nulled
        # out-of-range values).
        stand_idx = (result.best_stand_index or 1) - 1
        aim_idx = (result.best_aim_index or len(frames)) - 1
        stand_idx = max(0, min(stand_idx, len(frames) - 1))
        aim_idx = max(0, min(aim_idx, len(frames) - 1))
    else:
        # Classifier disabled or threw before returning — keep chapter, use
        # first/last grid frame. No suggestions written.
        stand_idx = 0
        aim_idx = len(frames) - 1

    stand_bytes = frames[stand_idx]
    aim_bytes = frames[aim_idx]

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
        lineup = await lineup_service.create_from_ingestion(db, payload)
        # If the classifier produced suggestions, write them through the repo
        # before the single commit (status stays pending_review). The commit
        # boundary (with rollback-on-failure) is owned by the repo layer per
        # PR #687 — the orchestrator never calls db.commit()/db.rollback()
        # directly.
        if classifier_ran and result is not None and result.is_lineup:
            await write_classifier_suggestions(
                db, lineup, _classifier_suggestion_fields(result)
            )
        await lineup_repo.commit_classifier_run(db)
    except Exception as exc:
        # commit_classifier_run already rolled back on a commit failure;
        # create_from_ingestion rolls back on its own failure. This catch is
        # the structured-logging seam — the diagnostic context (source/video/
        # chapter + exc_info) must survive, so keep it.
        logger.error(
            "DB insert failed: source_id=%s video_id=%s chapter_start=%d error=%s",
            source.id, video_meta.video_id, start, str(exc),
            exc_info=True,
        )
        return False

    if classifier_ran and result is not None and result.is_lineup:
        logger.info(
            "Classifier success (grid): source_id=%s video_id=%s "
            "chapter_start=%d lineup_id=%s stand_idx=%d aim_idx=%d "
            "confidence=%.2f",
            source.id, video_meta.video_id, start, lineup.id,
            stand_idx, aim_idx, result.confidence or 0.0,
        )

    return True


async def _process_video(
    video_meta: VideoMeta,
    download_dir: Path,
    db: AsyncSession,
    source: Source,
    stats: SyncStats,
) -> None:
    """Fetch full metadata, parse chapters, download, and create lineup rows."""
    logger.info(
        "Processing video: source_id=%s video_id=%s title=%r",
        source.id, video_meta.video_id, video_meta.title,
    )

    # list_videos() uses extract_flat, so for playlist/channel sources
    # video_meta has no description/duration/chapters. Fetch the full per-video
    # info dict before parsing — otherwise every video looks chapter-less and
    # the sync produces 0 lineups.
    try:
        video_meta = await fetch_video_detail(video_meta.video_id)
    except YouTubeFetchError as exc:
        logger.error(
            "Video detail fetch failed: source_id=%s video_id=%s error_type=%s message=%s",
            source.id, video_meta.video_id, exc.error_type, str(exc),
        )
        stats.error_count += 1
        stats.errors.append(f"{video_meta.video_id}: detail fetch failed ({exc.error_type})")
        return

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

    # Drop structural chapters (intro/outro/"tip N"/subscribe/short) before
    # download + frame extraction + classifier calls — they only produce junk
    # pending lineups and waste a Claude call each. See chapter_parser.
    parsed_count = len(chapters)
    chapters = filter_lineup_chapters(chapters)
    dropped = parsed_count - len(chapters)
    if dropped:
        logger.info(
            "Filtered %d/%d non-lineup chapters (intro/outro/tip/short): "
            "source_id=%s video_id=%s",
            dropped, parsed_count, source.id, video_meta.video_id,
        )
    if not chapters:
        logger.info(
            "All %d parsed chapters were non-lineup structure — source is "
            "likely not a lineup tutorial: source_id=%s video_id=%s — skipping",
            parsed_count, source.id, video_meta.video_id,
        )
        return

    logger.info(
        "Found %d lineup chapters (%d parsed, %d filtered): "
        "source_id=%s video_id=%s",
        len(chapters), parsed_count, dropped, source.id, video_meta.video_id,
    )

    # Download only now that we know there are chapters worth extracting.
    try:
        video_path = await download_video(video_meta.video_id, download_dir)
    except VideoDownloadError as exc:
        logger.error(
            "Video download failed: source_id=%s video_id=%s error_type=%s message=%s",
            source.id, video_meta.video_id, exc.error_type, str(exc),
        )
        stats.error_count += 1
        stats.errors.append(f"{video_meta.video_id}: download failed ({exc.error_type})")
        return

    try:
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
        stats.errors.append(f"list_videos failed: {exc.error_type}: {exc}")
        stats.error_count += 1
        return stats

    if not video_metas:
        logger.info("sync_source: no videos found: source_id=%s", source.id)
        await source_repo.record_sync_stats(
            db, source, video_count=0, chapter_count=0, error_count=0
        )
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

    # Update source stats. Atomic: if the stats flush OR commit fails we roll
    # back so the source row is not left with a half-applied config_json (the
    # old code logged-and-continued, silently degrading the session). The
    # commit boundary + commit-failure rollback are owned by the repo layer
    # (commit_sync_stats); a flush failure is rolled back here explicitly so
    # neither failure mode leaves the session in a broken half-written state.
    try:
        await source_repo.record_sync_stats(
            db,
            source,
            video_count=stats.video_count,
            chapter_count=stats.chapter_count,
            error_count=stats.error_count,
        )
    except Exception as exc:
        # record_sync_stats already rolled back atomically (flush- or
        # commit-failure) — this catch is only the structured-logging seam.
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
