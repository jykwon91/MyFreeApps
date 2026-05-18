"""Backfill clips for accepted lineups that predate the clip pipeline.

Ingested lineups created before PR2 (and any whose clip generation failed at
ingest time) have ``clip_url IS NULL``. This walks that set, re-fetches each
source video ONCE (not once per lineup — a tutorial video usually backs many
lineups), localises the throw per chapter, and generates the clip.

Idempotent by construction: the work set is exactly
``status='accepted' AND youtube_video_id IS NOT NULL AND clip_url IS NULL``
(``lineup_repo.list_accepted_lineups_needing_clips``). A generated clip sets
``clip_url`` and drops out of the set, so re-running only processes the
remainder. A ``failed`` lineup keeps ``clip_url`` NULL and is retried on the
next run (transient yt-dlp/ffmpeg/Claude failures self-heal). A ``skipped``
lineup (genuinely not a throw) also stays NULL and will be re-evaluated on a
future run — that is the frozen design contract's definition of "done"
(clip_url set); the operator runs this once post-deploy, so re-evaluating a
handful of non-throws is acceptable and not worth a skip-memo column.

Per rules/no-bandaid-solutions.md + rules/check-third-party-error-codes.md:
every yt-dlp / ffmpeg / Claude failure is captured with its structured reason
and tallied — nothing silently disappears.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.chapter_parser import Chapter, parse_chapters
from app.services.ingestion.clip_generator import generate_clip_for_lineup
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


@dataclass
class BackfillStats:
    """Aggregate outcome of a backfill run (printed by the CLI)."""

    total: int = 0
    generated: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"backfill-clips: {self.total} candidate lineup(s) — "
            f"{self.generated} generated, {self.skipped} skipped, "
            f"{self.failed} failed"
        )


def _find_chapter(
    chapters: list[Chapter], start_seconds: int | None
) -> Chapter | None:
    """The chapter whose start matches the lineup's stored chapter start.

    The ingest path persisted ``chapter_start_seconds`` from the same
    ``parse_chapters`` output, so an exact start match re-identifies it. A
    miss means the video's chapters changed since ingest (re-upload / edited
    description) — the caller skips that lineup with a logged reason rather
    than guessing a wrong chapter.
    """
    if start_seconds is None:
        return None
    for ch in chapters:
        if ch.start_seconds == start_seconds:
            return ch
    return None


async def backfill_clips(db: AsyncSession) -> BackfillStats:
    """Generate clips for every accepted ingested lineup missing one.

    Returns a :class:`BackfillStats`. Designed to be invoked once by the
    operator post-deploy (``python -m app.cli backfill-clips``); safe to
    re-run at any time.
    """
    stats = BackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_clips(db)
    stats.total = len(lineups)
    if not lineups:
        logger.info("backfill-clips: nothing to do (no candidate lineups)")
        return stats

    # Group by source video so each video is fetched + downloaded ONCE.
    by_video: dict[str, list[Lineup]] = defaultdict(list)
    for lineup in lineups:
        by_video[lineup.youtube_video_id].append(lineup)

    download_dir = Path(settings.ingestion_download_dir)
    logger.info(
        "backfill-clips: %d lineup(s) across %d video(s)",
        stats.total, len(by_video),
    )

    for video_id, video_lineups in by_video.items():
        # ---- One metadata fetch per video ------------------------------
        try:
            meta = await fetch_video_detail(video_id)
        except YouTubeFetchError as exc:
            logger.warning(
                "backfill-clips: metadata fetch failed: video_id=%s "
                "error_type=%s message=%s — %d lineup(s) failed",
                video_id, exc.error_type, str(exc), len(video_lineups),
            )
            stats.failed += len(video_lineups)
            stats.errors.append(
                f"{video_id}: metadata fetch failed ({exc.error_type})"
            )
            continue

        chapters = parse_chapters(
            description=meta.description,
            video_duration=meta.duration,
            native_chapters=meta.chapters or None,
        )

        # ---- One download per video ------------------------------------
        try:
            video_path = await download_video(video_id, download_dir)
        except VideoDownloadError as exc:
            logger.warning(
                "backfill-clips: download failed: video_id=%s error_type=%s "
                "message=%s — %d lineup(s) failed",
                video_id, exc.error_type, str(exc), len(video_lineups),
            )
            stats.failed += len(video_lineups)
            stats.errors.append(
                f"{video_id}: download failed ({exc.error_type})"
            )
            continue

        try:
            for lineup in video_lineups:
                chapter = _find_chapter(chapters, lineup.chapter_start_seconds)
                if chapter is None:
                    logger.warning(
                        "backfill-clips: chapter not found: lineup=%s "
                        "video_id=%s chapter_start=%s — skipping",
                        lineup.id, video_id, lineup.chapter_start_seconds,
                    )
                    stats.skipped += 1
                    stats.errors.append(
                        f"{video_id}[{lineup.chapter_start_seconds}]: "
                        f"chapter not found (video changed since ingest)"
                    )
                    continue

                try:
                    result = await generate_clip_for_lineup(
                        db,
                        lineup,
                        chapter_start=float(chapter.start_seconds),
                        chapter_end=float(chapter.end_seconds),
                        # Reuse the once-downloaded file — do NOT let the
                        # generator re-download per lineup.
                        video_path=video_path,
                    )
                except Exception as exc:  # defensive: never abort the batch
                    logger.warning(
                        "backfill-clips: unexpected error: lineup=%s "
                        "video_id=%s error=%s",
                        lineup.id, video_id, str(exc), exc_info=True,
                    )
                    stats.failed += 1
                    stats.errors.append(f"{lineup.id}: unexpected {exc}")
                    continue

                if result.status == "generated":
                    stats.generated += 1
                elif result.status == "skipped":
                    stats.skipped += 1
                else:
                    stats.failed += 1
                    stats.errors.append(
                        f"{lineup.id}: {','.join(result.error_codes) or 'failed'}"
                    )
        finally:
            # The backfill owns this download (one per video) — clean it up
            # once, after all of the video's lineups are processed.
            try:
                video_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "backfill-clips: failed to delete video: path=%s error=%s",
                    video_path, str(exc),
                )

    logger.info("backfill-clips: complete — %s", stats.summary())
    return stats
