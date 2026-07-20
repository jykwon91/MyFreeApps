"""Backfill STAND + LANDING poster stills for accepted lineups missing them.

Companion to :mod:`poster_generator` (the shared per-lineup primitive) on the
standalone side — the ingest side is ``chapter_media.generate_chapter_media``.
#984 shipped the poster columns + extractor and populated the then-existing 797
video-ingested lineups via the exported pack; this is the durable operator
command (``python -m app.cli backfill-posters``) that repopulates any lineup a
future ingest missed — e.g. lineups whose clips were cut before the ingest-time
poster wiring landed, or whose poster step transiently failed.

Radically cheaper than the clip backfills (:mod:`micro_clip_backfill`,
:mod:`landing_clip_backfill`): a poster is the last frame of an ALREADY-UPLOADED
clip, so there is **no** yt-dlp metadata fetch, **no** video download, and **no**
chapter re-match. Each candidate is just: download two small clip objects,
ffmpeg the last frame of each to WebP, upload, persist. No source video ever
touches disk — hence no per-video grouping and no download cleanup.

Idempotent by construction: the work set is
``list_accepted_lineups_needing_posters`` (accepted + has a clip + screenshot
column not yet a ``*-poster.webp`` key). A generated poster flips the column to
the poster key and drops the lineup out of the set on the next run. A ``failed``
side leaves its column as-is and is retried next run (transient storage / ffmpeg
faults self-heal); a ``skipped`` side (no clip on that pane) stays as-is.

Per rules/check-third-party-error-codes.md every ffmpeg / storage failure is
captured with its structured reason (surfaced by ``poster_generator``) and
tallied — nothing silently disappears.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.poster_generator import (
    PosterGenerationResult,
    generate_posters_for_lineup,
)

logger = logging.getLogger(__name__)


@dataclass
class PosterBackfillStats:
    """Aggregate outcome of a poster backfill run (printed by the CLI).

    Stand and landing are tallied independently — each candidate lineup
    contributes one side-outcome to each counter pair. ``total`` is the number
    of *candidate lineups*; a candidate may need one or both posters.
    """

    total: int = 0
    stand_generated: int = 0
    stand_skipped: int = 0
    stand_failed: int = 0
    landing_generated: int = 0
    landing_skipped: int = 0
    landing_failed: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def generated(self) -> int:
        """Posters successfully generated this run (stand + landing)."""
        return self.stand_generated + self.landing_generated

    @property
    def failed(self) -> int:
        """Sides that hard-failed this run (stand + landing) — drives exit code."""
        return self.stand_failed + self.landing_failed

    def summary(self) -> str:
        return (
            f"backfill-posters: {self.total} candidate lineup(s) — "
            f"stand: {self.stand_generated}g/{self.stand_skipped}s/{self.stand_failed}f, "
            f"landing: {self.landing_generated}g/{self.landing_skipped}s/{self.landing_failed}f"
        )


async def backfill_posters(db: AsyncSession) -> PosterBackfillStats:
    """Generate STAND + LANDING posters for every accepted lineup missing one.

    Returns a :class:`PosterBackfillStats`. Designed to be invoked by the
    operator post-deploy (``python -m app.cli backfill-posters``); safe to
    re-run at any time (idempotent — a postered lineup drops out of the set).
    """
    stats = PosterBackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_posters(db)
    stats.total = len(lineups)
    if not lineups:
        logger.info("backfill-posters: nothing to do (no candidate lineups)")
        return stats

    logger.info("backfill-posters: %d candidate lineup(s)", stats.total)

    for lineup in lineups:
        try:
            result = await generate_posters_for_lineup(db, lineup)
        except Exception as exc:  # defensive: never abort the batch
            logger.warning(
                "backfill-posters: unexpected error: lineup=%s error=%s",
                lineup.id, str(exc), exc_info=True,
            )
            stats.stand_failed += 1
            stats.landing_failed += 1
            stats.errors.append(
                f"{lineup.id}: unexpected:{type(exc).__name__} {exc}"
            )
            continue

        _tally(stats, lineup, result)

    logger.info("backfill-posters: complete — %s", stats.summary())
    return stats


def _tally(
    stats: PosterBackfillStats,
    lineup: Lineup,
    result: PosterGenerationResult,
) -> None:
    """Increment the matching counters for both sides; record errors flat."""
    if result.stand_status == "generated":
        stats.stand_generated += 1
    elif result.stand_status == "skipped":
        stats.stand_skipped += 1
    else:
        stats.stand_failed += 1
        stats.errors.append(
            f"{lineup.id}[stand]: {','.join(result.stand_error_codes) or 'failed'}"
        )

    if result.landing_status == "generated":
        stats.landing_generated += 1
    elif result.landing_status == "skipped":
        stats.landing_skipped += 1
    else:
        stats.landing_failed += 1
        stats.errors.append(
            f"{lineup.id}[landing]: {','.join(result.landing_error_codes) or 'failed'}"
        )
