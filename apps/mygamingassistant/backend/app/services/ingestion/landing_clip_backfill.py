"""Backfill landing clips for accepted lineups that predate the PR5 pipeline.

Lineups created before PR5 (and any whose landing-clip generation failed at
ingest time) have ``landing_clip_url IS NULL``. This walks that set,
re-fetches each source video ONCE per video (not once per lineup — a
tutorial video usually backs many lineups), localises the landing via
``classify_throw_timing_from_frames``, and generates the landing clip.

Independent of :mod:`clip_backfill` by design: a lineup can have a PR2
throw clip but no landing clip (or vice versa). The two NULL columns are
separate work sets and the operator runs the two commands independently.

Idempotent by construction: the work set is exactly
``status='accepted' AND youtube_video_id IS NOT NULL AND landing_clip_url IS NULL``
(``lineup_repo.list_accepted_lineups_needing_landing_clips``). A generated
landing clip sets ``landing_clip_url`` and drops out of the set, so
re-running only processes the remainder. A ``failed`` lineup keeps
``landing_clip_url`` NULL and is retried on the next run (transient
yt-dlp / ffmpeg / Claude failures self-heal). A ``skipped`` lineup
(genuinely not a throw / chapter too short) also stays NULL and will be
re-evaluated on a future run.

Per rules/no-bandaid-solutions.md + rules/check-third-party-error-codes.md:
every yt-dlp / ffmpeg / Claude failure is captured with its structured
reason and tallied — nothing silently disappears.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.lineup import Lineup
from app.models.game.utility_type import UtilityType
from app.repositories.game import lineup_repo
from app.services.ingestion.chapter_parser import Chapter, parse_chapters
from app.services.ingestion.landing_clip_generator import (
    generate_landing_clip_for_lineup,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


@dataclass
class LandingClipBackfillStats:
    """Aggregate outcome of a landing-clip backfill run (printed by the CLI)."""

    total: int = 0
    generated: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"backfill-landing-clips: {self.total} candidate lineup(s) — "
            f"{self.generated} generated, {self.skipped} skipped, "
            f"{self.failed} failed"
        )


async def _utility_hint(db: AsyncSession, lineup: Lineup) -> str | None:
    """The lineup's confirmed utility slug, for the throw-timing RESULT cue.

    Same shape as :func:`clip_backfill._utility_hint` (PR2). A backfilled
    lineup is ``accepted`` — the operator already confirmed
    ``utility_type_id`` — so this hint is strictly stronger than the >0.6
    grid suggestion the ingest path uses.
    """
    if lineup.utility_type_id is None:
        return None
    return (
        await db.execute(
            select(UtilityType.slug).where(
                UtilityType.id == lineup.utility_type_id
            )
        )
    ).scalar_one_or_none()


def _find_chapter(
    chapters: list[Chapter], start_seconds: int | None
) -> Chapter | None:
    """The chapter whose start matches the lineup's stored chapter start.

    Identical to :func:`clip_backfill._find_chapter` — the ingest path
    persisted ``chapter_start_seconds`` from the same ``parse_chapters``
    output, so an exact start match re-identifies it. A miss means the
    video's chapters changed since ingest.
    """
    if start_seconds is None:
        return None
    for ch in chapters:
        if ch.start_seconds == start_seconds:
            return ch
    return None


async def backfill_landing_clips(db: AsyncSession) -> LandingClipBackfillStats:
    """Generate landing clips for every accepted ingested lineup missing one.

    Returns a :class:`LandingClipBackfillStats`. Designed to be invoked once
    by the operator post-deploy (``python -m app.cli backfill-landing-clips``);
    safe to re-run at any time.
    """
    stats = LandingClipBackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_landing_clips(db)
    stats.total = len(lineups)
    if not lineups:
        logger.info(
            "backfill-landing-clips: nothing to do (no candidate lineups)"
        )
        return stats

    # Group by source video so each video is fetched + downloaded ONCE.
    by_video: dict[str, list[Lineup]] = defaultdict(list)
    for lineup in lineups:
        by_video[lineup.youtube_video_id].append(lineup)

    download_dir = Path(settings.ingestion_download_dir)
    logger.info(
        "backfill-landing-clips: %d lineup(s) across %d video(s)",
        stats.total, len(by_video),
    )

    for video_id, video_lineups in by_video.items():
        # ---- One metadata fetch per video ------------------------------
        try:
            meta = await fetch_video_detail(video_id)
        except YouTubeFetchError as exc:
            logger.warning(
                "backfill-landing-clips: metadata fetch failed: video_id=%s "
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
                "backfill-landing-clips: download failed: video_id=%s "
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
                        "backfill-landing-clips: chapter not found: "
                        "lineup=%s video_id=%s chapter_start=%s — skipping",
                        lineup.id, video_id, lineup.chapter_start_seconds,
                    )
                    stats.skipped += 1
                    stats.errors.append(
                        f"{video_id}[{lineup.chapter_start_seconds}]: "
                        f"chapter not found (video changed since ingest)"
                    )
                    continue

                try:
                    result = await generate_landing_clip_for_lineup(
                        db,
                        lineup,
                        chapter_start=float(chapter.start_seconds),
                        chapter_end=float(chapter.end_seconds),
                        # Reuse the once-downloaded file — do NOT let the
                        # generator re-download per lineup.
                        video_path=video_path,
                        utility_hint=await _utility_hint(db, lineup),
                        # Backfill runs its own classifier call — no PR2
                        # context to share here.
                        precomputed_result_ts=None,
                    )
                except Exception as exc:  # defensive: never abort the batch
                    logger.warning(
                        "backfill-landing-clips: unexpected error: lineup=%s "
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
                        f"{lineup.id}: "
                        f"{','.join(result.error_codes) or 'failed'}"
                    )
        finally:
            # The backfill owns this download (one per video) — clean it up
            # once, after all of the video's lineups are processed.
            try:
                video_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "backfill-landing-clips: failed to delete video: "
                    "path=%s error=%s",
                    video_path, str(exc),
                )

    logger.info("backfill-landing-clips: complete — %s", stats.summary())
    return stats
