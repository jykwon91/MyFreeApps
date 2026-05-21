"""Backfill throw-technique for accepted lineups that predate PR3.

Ingested lineups created before PR3 (and any whose technique extraction
failed at ingest time) have ``technique IS NULL``. This walks that set,
re-fetches each source video ONCE (not once per lineup — a tutorial video
usually backs many lineups), and names the throw technique per chapter.

Idempotent by construction: the work set is exactly
``status='accepted' AND youtube_video_id IS NOT NULL AND technique IS NULL``
(``lineup_repo.list_accepted_lineups_needing_technique``). A populated
technique drops out of the set, so re-running only processes the remainder. A
``failed`` lineup keeps ``technique`` NULL and is retried on the next run
(transient yt-dlp/ffmpeg/Claude failures self-heal). A ``skipped`` lineup
(genuinely no determinable technique) also stays NULL and will be re-evaluated
on a future run — the frozen contract's definition of "done" is ``technique``
set; the operator runs this once post-deploy, so re-evaluating a handful of
no-technique chapters is acceptable and not worth a skip-memo column.

Independent of the PR2 ``backfill-clips`` (separate operator command, separate
NULL column) — deliberately NOT coupled; the two run at different times.

Per rules/no-bandaid-solutions.md + rules/check-third-party-error-codes.md:
every yt-dlp / ffmpeg / Claude failure is captured with its structured reason
and tallied — nothing silently disappears.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.chapter_parser import Chapter, parse_chapters
from app.services.ingestion.technique_extractor import (
    extract_technique_for_lineup,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


@dataclass
class TechniqueBackfillStats:
    """Aggregate outcome of a technique-backfill run (printed by the CLI)."""

    total: int = 0
    generated: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"backfill-technique: {self.total} candidate lineup(s) — "
            f"{self.generated} generated, {self.skipped} skipped, "
            f"{self.failed} failed"
        )


async def _game_slug(db: AsyncSession, lineup: Lineup) -> str | None:
    """The lineup's confirmed game slug, for the technique vocabulary block.

    A backfilled lineup is ``accepted`` so ``game_id`` is non-null by the
    ``ck_lineup_accepted_classified`` CHECK. The repo query doesn't eager-load
    the relationship, so resolve the slug by id explicitly (a lazy attribute
    access would raise under async SQLAlchemy).
    """
    if lineup.game_id is None:
        return None
    return (
        await db.execute(select(Game.slug).where(Game.id == lineup.game_id))
    ).scalar_one_or_none()


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


async def backfill_technique(db: AsyncSession) -> TechniqueBackfillStats:
    """Name the throw technique for every accepted ingested lineup missing one.

    Returns a :class:`TechniqueBackfillStats`. Designed to be invoked once by
    the operator post-deploy (``python -m app.cli backfill-technique``); safe
    to re-run at any time.
    """
    stats = TechniqueBackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_technique(db)
    stats.total = len(lineups)
    if not lineups:
        logger.info("backfill-technique: nothing to do (no candidate lineups)")
        return stats

    # Group by source video so each video is fetched + downloaded ONCE.
    by_video: dict[str, list[Lineup]] = defaultdict(list)
    for lineup in lineups:
        by_video[lineup.youtube_video_id].append(lineup)

    download_dir = Path(settings.ingestion_download_dir)
    logger.info(
        "backfill-technique: %d lineup(s) across %d video(s)",
        stats.total, len(by_video),
    )

    for video_id, video_lineups in by_video.items():
        # ---- One metadata fetch per video ------------------------------
        try:
            meta = await fetch_video_detail(video_id)
        except YouTubeFetchError as exc:
            logger.warning(
                "backfill-technique: metadata fetch failed: video_id=%s "
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
                "backfill-technique: download failed: video_id=%s "
                "error_type=%s message=%s — %d lineup(s) failed",
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
                        "backfill-technique: chapter not found: lineup=%s "
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
                    result = await extract_technique_for_lineup(
                        db,
                        lineup,
                        chapter_start=float(chapter.start_seconds),
                        chapter_end=float(chapter.end_seconds),
                        game_slug=await _game_slug(db, lineup),
                        # Reuse the once-downloaded file — do NOT let the
                        # extractor re-download per lineup.
                        video_path=video_path,
                    )
                except Exception as exc:  # defensive: never abort the batch
                    logger.warning(
                        "backfill-technique: unexpected error: lineup=%s "
                        "video_id=%s error=%s",
                        lineup.id, video_id, str(exc), exc_info=True,
                    )
                    stats.failed += 1
                    stats.errors.append(
                        f"{lineup.id}: unexpected:{type(exc).__name__} {exc}"
                    )
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
                    "backfill-technique: failed to delete video: path=%s "
                    "error=%s",
                    video_path, str(exc),
                )

    logger.info("backfill-technique: complete — %s", stats.summary())
    return stats
