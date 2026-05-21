"""Backfill the wider trim-editor source for lineups still on the legacy
pane-editor posture (``*_url_original`` equals the tight ``*_url``).

The 0015 migration backfilled ``*_url_original = *_url`` so the trim editor
had something to read on rows that predated the pane-editor work. That's
correct as a floor — every trim cuts from a clip — but it gives the
operator nothing wider than the original ingest cut. This backfill replaces
each equal pair with a wider clip spanning the chapter + padding, so the
operator can drag the trim past those tight bounds without re-fetching the
YouTube video each time.

End-to-end (mirrors :mod:`clip_backfill` / :mod:`landing_clip_backfill`):

  1. Walk ``lineup_repo.list_accepted_lineups_needing_widen_source`` —
     accepted, has a YouTube source, at least one pane where tight == wide.
  2. Group by ``youtube_video_id`` so each source video is fetched +
     downloaded ONCE (a tutorial video usually backs many lineups).
  3. For each lineup in the video's group, look up the chapter via
     ``parse_chapters`` (same exact-start match the other backfills use),
     then for each pane whose tight == wide, cut the wider clip via
     :func:`cut_and_upload_wide_source` and persist via the matching
     ``set_*_url_original`` setter.
  4. Offsets stay NULL deliberately — the backfill does NOT re-run Claude
     (saves $0.016/row and an ffmpeg + upload), so it cannot place the
     existing tight clip's window inside the wider source. The slider opens
     at the full wide bounds and the operator drags to refine. The
     previously-served tight bytes remain unchanged at their original key
     and autoplay is unaffected.

Idempotent by construction: a successful widen on a pane sets
``*_url_original`` to the new key, breaking the equality the candidate
query checks, so the pane drops out on the next run. A failed pane keeps
the equality and is retried.

Per rules/no-bandaid-solutions.md + rules/check-third-party-error-codes.md:
every yt-dlp / ffmpeg / MinIO failure is captured with its structured
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
from app.services.ingestion.clip_generator import pending_clip_source_key
from app.services.ingestion.landing_clip_generator import (
    pending_landing_clip_source_key,
)
from app.services.ingestion.wide_source import cut_and_upload_wide_source
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
    download_video,
    fetch_video_detail,
)

logger = logging.getLogger(__name__)


@dataclass
class WidenSourceBackfillStats:
    """Aggregate outcome of a widen-source backfill run (printed by the CLI).

    Counts are per-pane (not per-row), so a row with both throw and landing
    widened contributes 2 to ``widened``. A row where only the throw needed
    widening (landing already widened or absent) contributes 1.
    """

    total_rows: int = 0
    widened: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"widen-source: {self.total_rows} candidate row(s) — "
            f"{self.widened} pane(s) widened, {self.skipped} skipped, "
            f"{self.failed} failed"
        )


def _find_chapter(
    chapters: list[Chapter], start_seconds: int | None,
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


def _throw_needs_widen(lineup: Lineup) -> bool:
    """True when the throw pane's source still equals its tight clip."""
    return (
        lineup.clip_url is not None
        and lineup.clip_url_original == lineup.clip_url
    )


def _landing_needs_widen(lineup: Lineup) -> bool:
    """True when the landing pane's source still equals its tight clip."""
    return (
        lineup.landing_clip_url is not None
        and lineup.landing_clip_url_original == lineup.landing_clip_url
    )


async def _widen_pane(
    *,
    db: AsyncSession,
    lineup: Lineup,
    video_path: Path,
    chapter: Chapter,
    pane: str,
    stats: WidenSourceBackfillStats,
) -> None:
    """Widen one pane on one lineup; mutate *stats* with the outcome.

    Encapsulates the per-pane cut + upload + persist tuple so the outer
    loop reads as "for each pane that needs widening, widen it". The two
    panes are independent: a throw failure does NOT prevent the landing
    widen on the same row from being attempted.
    """
    video_id = lineup.youtube_video_id
    assert video_id is not None  # guaranteed by the repo query

    if pane == "throw":
        source_key = pending_clip_source_key(video_id, chapter.start_seconds)
        persist = lineup_repo.set_clip_url_original
    elif pane == "landing":
        source_key = pending_landing_clip_source_key(
            video_id, chapter.start_seconds,
        )
        persist = lineup_repo.set_landing_clip_url_original
    else:
        raise ValueError(f"unknown pane {pane!r}")

    wide = await cut_and_upload_wide_source(
        local_video=video_path,
        video_id=video_id,
        chapter_start=float(chapter.start_seconds),
        chapter_end=float(chapter.end_seconds),
        source_key=source_key,
        log_prefix="widen-source-backfill",
        lineup_id=lineup.id,
    )
    if not wide.succeeded:
        stats.failed += 1
        stats.errors.append(
            f"{lineup.id}[{pane}]: "
            f"{','.join(wide.error_codes) or 'wide_source_failed'}"
        )
        return

    try:
        await persist(db, lineup, wide.source_key)  # type: ignore[arg-type]
    except Exception as exc:  # noqa: BLE001 — surface any persistence error
        logger.warning(
            "widen-source-backfill: %s_url_original persist failed "
            "(object uploaded, column not committed; backfill is "
            "idempotent): lineup=%s key=%s error=%s",
            pane, lineup.id, wide.source_key, str(exc),
        )
        stats.failed += 1
        stats.errors.append(
            f"{lineup.id}[{pane}]: persist_failed:{type(exc).__name__}"
        )
        return

    stats.widened += 1


async def backfill_widen_source(
    db: AsyncSession,
) -> WidenSourceBackfillStats:
    """Widen the trim-editor source for every accepted ingested lineup that
    still has ``*_url_original = *_url``.

    Returns a :class:`WidenSourceBackfillStats`. Designed to be invoked once
    by the operator post-deploy (``python -m app.cli widen-source``); safe
    to re-run at any time — only rows whose tight still equals their wide
    are touched.
    """
    stats = WidenSourceBackfillStats()

    lineups = await lineup_repo.list_accepted_lineups_needing_widen_source(db)
    stats.total_rows = len(lineups)
    if not lineups:
        logger.info("widen-source: nothing to do (no candidate lineups)")
        return stats

    # Group by source video so each video is fetched + downloaded ONCE.
    by_video: dict[str, list[Lineup]] = defaultdict(list)
    for lineup in lineups:
        by_video[lineup.youtube_video_id].append(lineup)  # type: ignore[index]

    download_dir = Path(settings.ingestion_download_dir)
    logger.info(
        "widen-source: %d candidate row(s) across %d video(s)",
        stats.total_rows, len(by_video),
    )

    for video_id, video_lineups in by_video.items():
        # ---- One metadata fetch per video ------------------------------
        try:
            meta = await fetch_video_detail(video_id)
        except YouTubeFetchError as exc:
            # Count one failure per pane that needed widening across the
            # video's lineups — so the stats reflect actual blocked work.
            blocked_panes = sum(
                int(_throw_needs_widen(li)) + int(_landing_needs_widen(li))
                for li in video_lineups
            )
            logger.warning(
                "widen-source: metadata fetch failed: video_id=%s "
                "error_type=%s message=%s — %d pane(s) blocked",
                video_id, exc.error_type, str(exc), blocked_panes,
            )
            stats.failed += blocked_panes
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
            blocked_panes = sum(
                int(_throw_needs_widen(li)) + int(_landing_needs_widen(li))
                for li in video_lineups
            )
            logger.warning(
                "widen-source: download failed: video_id=%s error_type=%s "
                "message=%s — %d pane(s) blocked",
                video_id, exc.error_type, str(exc), blocked_panes,
            )
            stats.failed += blocked_panes
            stats.errors.append(
                f"{video_id}: download failed ({exc.error_type})"
            )
            continue

        try:
            for lineup in video_lineups:
                chapter = _find_chapter(chapters, lineup.chapter_start_seconds)
                if chapter is None:
                    blocked_panes = (
                        int(_throw_needs_widen(lineup))
                        + int(_landing_needs_widen(lineup))
                    )
                    logger.warning(
                        "widen-source: chapter not found: lineup=%s "
                        "video_id=%s chapter_start=%s — %d pane(s) skipped",
                        lineup.id, video_id, lineup.chapter_start_seconds,
                        blocked_panes,
                    )
                    stats.skipped += blocked_panes
                    stats.errors.append(
                        f"{video_id}[{lineup.chapter_start_seconds}]: "
                        f"chapter not found (video changed since ingest)"
                    )
                    continue

                # Two panes per row, independent — both attempted even if
                # one fails. ``_widen_pane`` mutates ``stats`` directly.
                if _throw_needs_widen(lineup):
                    try:
                        await _widen_pane(
                            db=db, lineup=lineup, video_path=video_path,
                            chapter=chapter, pane="throw", stats=stats,
                        )
                    except Exception as exc:  # defensive: never abort the batch
                        logger.warning(
                            "widen-source: unexpected error widening throw: "
                            "lineup=%s video_id=%s error=%s",
                            lineup.id, video_id, str(exc), exc_info=True,
                        )
                        stats.failed += 1
                        stats.errors.append(
                            f"{lineup.id}[throw]: "
                            f"unexpected:{type(exc).__name__} {exc}"
                        )

                if _landing_needs_widen(lineup):
                    try:
                        await _widen_pane(
                            db=db, lineup=lineup, video_path=video_path,
                            chapter=chapter, pane="landing", stats=stats,
                        )
                    except Exception as exc:  # defensive: never abort the batch
                        logger.warning(
                            "widen-source: unexpected error widening landing: "
                            "lineup=%s video_id=%s error=%s",
                            lineup.id, video_id, str(exc), exc_info=True,
                        )
                        stats.failed += 1
                        stats.errors.append(
                            f"{lineup.id}[landing]: "
                            f"unexpected:{type(exc).__name__} {exc}"
                        )
        finally:
            # The backfill owns this download (one per video) — clean it up
            # once, after all of the video's lineups are processed.
            try:
                video_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "widen-source: failed to delete video: path=%s error=%s",
                    video_path, str(exc),
                )

    logger.info("widen-source: complete — %s", stats.summary())
    return stats
