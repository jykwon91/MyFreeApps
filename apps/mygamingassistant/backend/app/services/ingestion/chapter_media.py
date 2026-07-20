"""Per-chapter best-effort media generation — the tail of ingestion.

Extracted from :mod:`ingestion_orchestrator` (which owns fetch → grid-extract →
classify → row-insert). Once a chapter has been judged a lineup and its row +
classifier suggestions are committed, this module runs the sequence of
best-effort media enhancements over the already-on-disk source video:

  1. THROW clip        (``generate_clip_for_lineup``)      → release_ts/result_ts
  2. LANDING clip      (``generate_landing_clip_for_lineup``, reuses result_ts)
  3. STAND+AIM micro   (``generate_micro_clips_for_lineup``, reuses release_ts)
  4. STAND+LANDING poster stills (``generate_posters_for_lineup``, off the clips)
  5. THROW technique   (``extract_technique_for_lineup``)  → footer text

Every step is independently non-fatal: each owns its own one-column commit in the
repo layer, and a failure in one must NEVER roll back the lineup, its classifier
suggestions, or a sibling step's output. The broad ``except Exception`` around
each step is defensive against an unexpected bug taking down the whole ingest —
the generators themselves return structured outcomes for expected failures.

The sequence reuses the ONE downloaded video for all steps (``_process_video``
deletes it once after every chapter) and passes precomputed throw timings
forward so ingest adds no extra Claude spend beyond the grid classifier.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.source import Source
from app.models.game.utility_type import UtilityType
from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.clip_generator import generate_clip_for_lineup
from app.services.ingestion.landing_clip_generator import (
    generate_landing_clip_for_lineup,
)
from app.services.ingestion.micro_clip_generator import (
    generate_micro_clips_for_lineup,
)
from app.services.ingestion.poster_generator import generate_posters_for_lineup
from app.services.ingestion.technique_extractor import (
    extract_technique_for_lineup,
)
from app.services.ingestion.youtube_fetcher import VideoMeta

logger = logging.getLogger(__name__)


async def _resolve_utility_hint(db: AsyncSession, result) -> Optional[str]:
    """The grid-classified utility slug, only when the grid was confident.

    The throw-timing prompt keys its RESULT cue on the utility (an expanding
    smoke cloud and a molotov flame look nothing alike). Below the >0.6 gate
    the grid wasn't sure of the utility, so a hint would mislead more than it
    helps — pass none and let the throw-timing call judge unaided.
    """
    if (
        result.suggested_utility_type_id is None
        or result.confidence is None
        or result.confidence <= 0.6
    ):
        return None
    return (
        await db.execute(
            select(UtilityType.slug).where(
                UtilityType.id == result.suggested_utility_type_id
            )
        )
    ).scalar_one_or_none()


async def _resolve_game_hint(db: AsyncSession, result) -> Optional[str]:
    """The grid-classified game slug, only when the grid was confident.

    The throw-technique prompt selects a game-specific vocabulary block (CS2
    mouse buttons vs Valorant ability keys) — passing the wrong game would
    yield a nonsense phrase. Below the same >0.6 gate the utility hint uses,
    the grid wasn't sure of the game, so pass none and let the technique
    prompt determine the game from the HUD itself (its generic block enforces
    the same game-first discipline as the grid classifier).
    """
    if (
        result.suggested_game_id is None
        or result.confidence is None
        or result.confidence <= 0.6
    ):
        return None
    return (
        await db.execute(
            select(Game.slug).where(Game.id == result.suggested_game_id)
        )
    ).scalar_one_or_none()


async def generate_chapter_media(
    db: AsyncSession,
    *,
    lineup,
    chapter: Chapter,
    source: Source,
    video_meta: VideoMeta,
    video_path,
    result,
) -> None:
    """Run the best-effort clip/landing/micro/poster/technique sequence.

    Called once per accepted-as-lineup chapter, AFTER the row + classifier
    suggestions are committed. Every step is non-fatal and self-committing —
    this coroutine never raises for an expected media failure and never rolls
    back the lineup. Returns nothing; all effects are the per-column commits
    inside the generators.
    """
    start = chapter.start_seconds

    # PR2: best-effort throw clip. The source video is still on disk
    # (_process_video deletes it once after ALL chapters), so reuse it —
    # never re-download per chapter. This runs AFTER the row + classifier
    # suggestions are committed: a clip failure must NOT roll back or fail
    # the chapter — the lineup is fully usable from its two stills, and a
    # clip is a best-effort enhancement only. generate_clip_for_lineup
    # returns structured outcomes and doesn't raise for expected
    # failures; the broad catch is purely defensive against an unexpected
    # bug taking down ingestion.
    clip_result = None
    try:
        utility_hint = await _resolve_utility_hint(db, result)
        clip_result = await generate_clip_for_lineup(
            db,
            lineup,
            chapter_start=float(chapter.start_seconds),
            chapter_end=float(chapter.end_seconds),
            video_path=video_path,
            utility_hint=utility_hint,
        )
        logger.info(
            "Clip generation (ingest): source_id=%s video_id=%s "
            "chapter_start=%d lineup_id=%s status=%s reason=%s",
            source.id, video_meta.video_id, start, lineup.id,
            clip_result.status,
            clip_result.skip_reason
            or (",".join(clip_result.error_codes) or "-"),
        )
    except Exception as exc:
        logger.warning(
            "Clip generation unexpected error (non-fatal): source_id=%s "
            "video_id=%s chapter_start=%d lineup_id=%s error=%s",
            source.id, video_meta.video_id, start, lineup.id, str(exc),
            exc_info=True,
        )

    # PR5: best-effort landing clip. Shares PR2's classifier output —
    # only fires when clip_result is "generated" (meaning PR2's gates
    # cleared and result_ts is known). We pass precomputed_result_ts so
    # landing_clip_generator does NOT make its own Claude call: the cost
    # of adding the landing pane to ingest is one extra ffmpeg cut plus
    # one extra MinIO upload per chapter — no extra classifier spend.
    # Skipped landings stay NULL and render the existing zone-text
    # fallback. Same non-fatal contract as the clip + technique blocks
    # above (landing-clip failure must not roll back the lineup).
    if (
        clip_result is not None
        and clip_result.status == "generated"
        and clip_result.result_ts is not None
    ):
        try:
            landing_result = await generate_landing_clip_for_lineup(
                db,
                lineup,
                chapter_start=float(chapter.start_seconds),
                chapter_end=float(chapter.end_seconds),
                video_path=video_path,
                precomputed_result_ts=clip_result.result_ts,
                precomputed_confidence=clip_result.confidence,
            )
            logger.info(
                "Landing-clip generation (ingest): source_id=%s "
                "video_id=%s chapter_start=%d lineup_id=%s status=%s "
                "reason=%s",
                source.id, video_meta.video_id, start, lineup.id,
                landing_result.status,
                landing_result.skip_reason
                or (",".join(landing_result.error_codes) or "-"),
            )
        except Exception as exc:
            logger.warning(
                "Landing-clip generation unexpected error "
                "(non-fatal): source_id=%s video_id=%s chapter_start=%d "
                "lineup_id=%s error=%s",
                source.id, video_meta.video_id, start, lineup.id,
                str(exc), exc_info=True,
            )

    # PR6 (revised 2026-05-24): BOTH STAND and AIM anchor on
    # release_ts (see micro_clip_generator docstring; grid stand_idx
    # is kept only for the still-image upload above, not the clip).
    # release_ts=None when THROW skipped/failed → both sides skip
    # cleanly. Non-fatal — failure must not roll back the row.
    _release_ts = clip_result.release_ts if (clip_result and clip_result.status == "generated") else None
    try:
        micro_result = await generate_micro_clips_for_lineup(
            db,
            lineup,
            chapter_start=float(chapter.start_seconds),
            chapter_end=float(chapter.end_seconds),
            video_path=video_path,
            precomputed_release_ts=_release_ts,
        )
        logger.info(
            "Micro-clip generation (ingest): source_id=%s video_id=%s "
            "chapter_start=%d lineup_id=%s stand=%s aim=%s",
            source.id, video_meta.video_id, start, lineup.id,
            micro_result.stand_status, micro_result.aim_status,
        )
    except Exception as exc:
        logger.warning(
            "Micro-clip generation unexpected error (non-fatal): "
            "source_id=%s video_id=%s chapter_start=%d lineup_id=%s "
            "error=%s",
            source.id, video_meta.video_id, start, lineup.id, str(exc),
            exc_info=True,
        )

    # #984 wiring: STAND + LANDING poster stills — a last-frame WebP pulled
    # from the STAND micro-clip and the LANDING clip so the glance board /
    # panes render an instant still instead of paying for a live-video
    # element on first paint. #984 shipped the extractor, the DB columns,
    # and a one-off backfill; this wires it into ingest so FUTURE ingests
    # auto-generate posters (no manual backfill). Runs AFTER the micro +
    # landing steps because it reads their already-uploaded clip objects.
    # Reuses those objects (two small downloads + WebP encodes) — no extra
    # Claude call, no video re-read. Same non-fatal, per-side, one-column
    # commit contract as the clip steps: a poster failure must NOT roll
    # back the lineup or any sibling clip/screenshot column.
    try:
        poster_result = await generate_posters_for_lineup(db, lineup)
        logger.info(
            "Poster generation (ingest): source_id=%s video_id=%s "
            "chapter_start=%d lineup_id=%s stand=%s landing=%s",
            source.id, video_meta.video_id, start, lineup.id,
            poster_result.stand_status, poster_result.landing_status,
        )
    except Exception as exc:
        logger.warning(
            "Poster generation unexpected error (non-fatal): source_id=%s "
            "video_id=%s chapter_start=%d lineup_id=%s error=%s",
            source.id, video_meta.video_id, start, lineup.id, str(exc),
            exc_info=True,
        )

    # PR3: best-effort throw-technique footer text. Symmetric to the clip
    # block above and equally non-fatal — independent Claude call, own
    # one-column commit, decoupled from the clip outcome (technique is
    # still produced when the clip was gated off). Reuse the on-disk
    # video (never re-download per chapter). extract_technique_for_lineup
    # returns structured outcomes and doesn't raise for expected
    # failures; the broad catch is purely defensive against an unexpected
    # bug taking down ingestion.
    try:
        game_hint_slug = await _resolve_game_hint(db, result)
        technique_result = await extract_technique_for_lineup(
            db,
            lineup,
            chapter_start=float(chapter.start_seconds),
            chapter_end=float(chapter.end_seconds),
            game_slug=game_hint_slug,
            video_path=video_path,
        )
        logger.info(
            "Technique extraction (ingest): source_id=%s video_id=%s "
            "chapter_start=%d lineup_id=%s status=%s reason=%s",
            source.id, video_meta.video_id, start, lineup.id,
            technique_result.status,
            technique_result.skip_reason
            or (",".join(technique_result.error_codes) or "-"),
        )
    except Exception as exc:
        logger.warning(
            "Technique extraction unexpected error (non-fatal): "
            "source_id=%s video_id=%s chapter_start=%d lineup_id=%s "
            "error=%s",
            source.id, video_meta.video_id, start, lineup.id, str(exc),
            exc_info=True,
        )
