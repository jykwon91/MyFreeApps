"""Backfill stand + aim micro-clips for accepted lineups that predate PR6.

Lineups created before PR6 (and any whose micro-clip generation failed at
ingest time) have ``stand_clip_url IS NULL`` and/or ``aim_clip_url IS NULL``.
This walks that set, re-fetches each source video ONCE per video (not once
per lineup — a tutorial video usually backs many lineups), and asks the
generator to localise the anchor + cut clips. Mirrors
:mod:`landing_clip_backfill` (PR5) shape exactly.

Anchor source (operator-tuned 2026-05-24):
  Both STAND and AIM derive from a single ``release_ts`` from the
  throw-timing classifier's dense pass:
    - STAND_TS = release_ts − _STAND_PRE_RELEASE_SECONDS (3.0s before)
    - AIM_TS   = release_ts − _AIM_PRE_RELEASE_SECONDS (0.8s before)
  The earlier grid-based STAND anchor was abandoned (PR following #761) —
  the 9-frame grid frequently picked the walk-up or windup frame rather
  than the settled stance. The throw-localizer's dense pass produces a
  reliable release frame (THROW + LANDING already depend on it), so
  STAND/AIM riding the same anchor is the no-bandaid fix.

The generator runs the throw-localizer itself on the backfill path; this
module just hands it the source video.

Independent of :mod:`clip_backfill` (PR2) and :mod:`landing_clip_backfill`
(PR5) by design: a lineup can have any combination of NULL micro-clip
columns. The three backfills are separate work sets and the operator runs
the commands independently.

Idempotent by construction: the work set is
``status='accepted' AND youtube_video_id IS NOT NULL AND (stand_clip_url IS
NULL OR aim_clip_url IS NULL)`` (``lineup_repo.list_accepted_lineups_needing_micro_clips``).
A generated clip sets the matching column and may drop the lineup out of
the set. The generator handles partial state internally — uploading both
sides per call is cheap (the heavy cost is the throw-localizer call +
download, done once per video). A ``failed`` side leaves its column NULL
and is retried on the next run (transient yt-dlp / ffmpeg / Claude
failures self-heal). A ``skipped`` side (no source video / chapter too
short / classifier disabled / no throw release in chapter) also stays
NULL and will be re-evaluated on a future run.

Per rules/no-bandaid-solutions.md + rules/check-third-party-error-codes.md:
every yt-dlp / ffmpeg / Claude failure is captured with its structured
reason and tallied — nothing silently disappears.
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
from app.services.ingestion.micro_clip_generator import (
    generate_micro_clips_for_lineup,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


@dataclass
class MicroClipBackfillStats:
    """Aggregate outcome of a micro-clip backfill run (printed by the CLI).

    Stand and aim are tallied independently — each lineup contributes one
    side-outcome to each counter pair. ``total`` is the number of
    *candidate lineups*; a candidate may have one or two NULL columns.
    """

    total: int = 0
    stand_generated: int = 0
    stand_skipped: int = 0
    stand_failed: int = 0
    aim_generated: int = 0
    aim_skipped: int = 0
    aim_failed: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def generated(self) -> int:
        """Sides successfully generated this run (stand + aim)."""
        return self.stand_generated + self.aim_generated

    @property
    def failed(self) -> int:
        """Sides that hard-failed this run (stand + aim) — drives exit code."""
        return self.stand_failed + self.aim_failed

    def summary(self) -> str:
        return (
            f"backfill-micro-clips: {self.total} candidate lineup(s) — "
            f"stand: {self.stand_generated}g/{self.stand_skipped}s/{self.stand_failed}f, "
            f"aim: {self.aim_generated}g/{self.aim_skipped}s/{self.aim_failed}f"
        )


def _find_chapter(
    chapters: list[Chapter], start_seconds: int | None
) -> Chapter | None:
    """The chapter whose start matches the lineup's stored chapter start.

    Identical to :func:`landing_clip_backfill._find_chapter` — the ingest
    path persisted ``chapter_start_seconds`` from the same ``parse_chapters``
    output, so an exact start match re-identifies it. A miss means the
    video's chapters changed since ingest.
    """
    if start_seconds is None:
        return None
    for ch in chapters:
        if ch.start_seconds == start_seconds:
            return ch
    return None


async def backfill_micro_clips(db: AsyncSession) -> MicroClipBackfillStats:
    """Generate stand + aim micro-clips for every accepted ingested lineup
    missing at least one.

    Returns a :class:`MicroClipBackfillStats`. Designed to be invoked once
    by the operator post-deploy (``python -m app.cli backfill-micro-clips``);
    safe to re-run at any time.
    """
    stats = MicroClipBackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_micro_clips(db)
    stats.total = len(lineups)
    if not lineups:
        logger.info(
            "backfill-micro-clips: nothing to do (no candidate lineups)"
        )
        return stats

    # Group by source video so each video is fetched + downloaded ONCE.
    by_video: dict[str, list[Lineup]] = defaultdict(list)
    for lineup in lineups:
        by_video[lineup.youtube_video_id].append(lineup)

    download_dir = Path(settings.ingestion_download_dir)
    logger.info(
        "backfill-micro-clips: %d lineup(s) across %d video(s)",
        stats.total, len(by_video),
    )

    for video_id, video_lineups in by_video.items():
        # ---- One metadata fetch per video ------------------------------
        try:
            meta = await fetch_video_detail(video_id)
        except YouTubeFetchError as exc:
            logger.warning(
                "backfill-micro-clips: metadata fetch failed: video_id=%s "
                "error_type=%s message=%s — %d lineup(s) failed (both sides)",
                video_id, exc.error_type, str(exc), len(video_lineups),
            )
            # Both sides hard-fail per lineup (one operational fault).
            stats.stand_failed += len(video_lineups)
            stats.aim_failed += len(video_lineups)
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
                "backfill-micro-clips: download failed: video_id=%s "
                "error_type=%s message=%s — %d lineup(s) failed (both sides)",
                video_id, exc.error_type, str(exc), len(video_lineups),
            )
            stats.stand_failed += len(video_lineups)
            stats.aim_failed += len(video_lineups)
            stats.errors.append(
                f"{video_id}: download failed ({exc.error_type})"
            )
            continue

        try:
            for lineup in video_lineups:
                chapter = _find_chapter(chapters, lineup.chapter_start_seconds)
                if chapter is None:
                    logger.warning(
                        "backfill-micro-clips: chapter not found: "
                        "lineup=%s video_id=%s chapter_start=%s — skipping",
                        lineup.id, video_id, lineup.chapter_start_seconds,
                    )
                    stats.stand_skipped += 1
                    stats.aim_skipped += 1
                    stats.errors.append(
                        f"{video_id}[{lineup.chapter_start_seconds}]: "
                        f"chapter not found (video changed since ingest)"
                    )
                    continue

                try:
                    result = await generate_micro_clips_for_lineup(
                        db,
                        lineup,
                        chapter_start=float(chapter.start_seconds),
                        chapter_end=float(chapter.end_seconds),
                        # Reuse the once-downloaded file — do NOT let the
                        # generator re-download per lineup.
                        video_path=video_path,
                        # Omit precomputed_release_ts — its _UNRESOLVED
                        # sentinel default tells the generator "I am the
                        # backfill path; run the throw-localizer yourself".
                    )
                except Exception as exc:  # defensive: never abort the batch
                    logger.warning(
                        "backfill-micro-clips: unexpected error: lineup=%s "
                        "video_id=%s error=%s",
                        lineup.id, video_id, str(exc), exc_info=True,
                    )
                    stats.stand_failed += 1
                    stats.aim_failed += 1
                    stats.errors.append(
                        f"{lineup.id}: unexpected:{type(exc).__name__} {exc}"
                    )
                    continue

                # Tally per side independently — the generator returns the
                # paired result but the two columns are committed separately.
                _tally_side(stats, lineup, "stand", result.stand_status,
                            result.stand_error_codes)
                _tally_side(stats, lineup, "aim", result.aim_status,
                            result.aim_error_codes)
        finally:
            # The backfill owns this download (one per video) — clean it up
            # once, after all of the video's lineups are processed.
            try:
                video_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "backfill-micro-clips: failed to delete video: "
                    "path=%s error=%s",
                    video_path, str(exc),
                )

    logger.info("backfill-micro-clips: complete — %s", stats.summary())
    return stats


def _tally_side(
    stats: MicroClipBackfillStats,
    lineup: Lineup,
    side: str,
    status: str,
    error_codes: list[str],
) -> None:
    """Increment the matching counter for one side; record errors flat."""
    if side == "stand":
        if status == "generated":
            stats.stand_generated += 1
        elif status == "skipped":
            stats.stand_skipped += 1
        else:
            stats.stand_failed += 1
            stats.errors.append(
                f"{lineup.id}[stand]: {','.join(error_codes) or 'failed'}"
            )
    else:  # aim
        if status == "generated":
            stats.aim_generated += 1
        elif status == "skipped":
            stats.aim_skipped += 1
        else:
            stats.aim_failed += 1
            stats.errors.append(
                f"{lineup.id}[aim]: {','.join(error_codes) or 'failed'}"
            )
