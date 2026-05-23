"""Internal helpers for :mod:`micro_clip_generator` — kept in a sibling
module so the generator stays under the file-size growth guard (the
generator was already over the 500-LOC threshold; growth requires a
matching split per TECH_DEBT.md "no-growth on flagged files").

What lives here:
  - ``_resolve_stand_ts_via_grid_classifier`` — backfill stand anchor.
  - ``_resolve_release_ts_via_throw_localizer`` — backfill aim anchor.
  - ``_cut_upload_persist_one_side`` — per-side ffmpeg cut + MinIO upload
    + repo commit (shared by both stand and aim).

The generator imports these directly; no re-export shim is needed because
they are private (``_``-prefixed) and the only caller is the generator
module. Tests patch them via the generator's ``_MOD`` because the generator
re-binds the names at import time.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.services.classification.classifier_service import (
    classify_frames_for_lineup_decision,
)
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
    cut_clip,
    extract_frames,
    grid_timestamps,
)
from app.services.ingestion.throw_localizer import (
    localize_throw_with_refinement,
)

logger = logging.getLogger(__name__)

# Grid sample count + edge padding — must match the ingest orchestrator's
# ingestion_orchestrator._GRID_FRAME_COUNT / _GRID_EDGE_PADDING_SECONDS so
# the backfill recovers the SAME timestamps the ingest pass extracted.
_GRID_FRAME_COUNT = 9
_GRID_EDGE_PADDING_SECONDS = 1.0


async def _resolve_stand_ts_via_grid_classifier(
    db: AsyncSession,
    lineup: Lineup,
    video_path: Path,
    chapter_start: float,
    chapter_end: float,
) -> tuple[Optional[float], list[str], str]:
    """Backfill helper: re-run the grid classifier to recover stand_ts.

    Returns ``(stand_ts, error_codes, reasoning)``. The grid classifier also
    returns an ``aim_idx`` but it is intentionally discarded — AIM_TS is now
    derived from release_ts (see micro_clip_generator module docstring); the
    grid pass is too sparse to localise the sub-second aim moment. STAND is
    unaffected because the standing-at-spot window is many seconds long.
    """
    timestamps = grid_timestamps(
        float(chapter_start),
        float(chapter_end),
        _GRID_FRAME_COUNT,
        edge_padding_seconds=_GRID_EDGE_PADDING_SECONDS,
    )
    if not timestamps:
        return None, ["empty_grid_window"], "chapter window produced no grid frames"

    try:
        frames = await extract_frames(video_path, timestamps)
    except FrameExtractionError as exc:
        logger.warning(
            "micro_clip_helpers: grid frame extraction failed: "
            "lineup=%s returncode=%s stderr=%s",
            lineup.id, exc.returncode, exc.stderr[:300],
        )
        return None, [f"frame_extract:rc={exc.returncode}"], str(exc)

    if not frames:
        return None, ["grid_frames_empty"], "ffmpeg returned no frames"

    try:
        result = await classify_frames_for_lineup_decision(
            db,
            frames=frames,
            chapter_title=lineup.chapter_title or "",
            attribution_author=lineup.attribution_author,
            game_hint=None,
        )
    except Exception as exc:
        logger.warning(
            "micro_clip_helpers: grid classifier raised: lineup=%s error=%s",
            lineup.id, str(exc),
        )
        return None, [f"classifier_raised:{type(exc).__name__}"], str(exc)

    if not result.success:
        logger.warning(
            "micro_clip_helpers: grid classifier call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, result.error_codes,
        )
        return None, list(result.error_codes), "grid classifier reported failure"

    if not result.is_lineup:
        # Accepted lineup but classifier says "not a lineup" → keep the
        # signal but skip cleanly rather than fabricate a timestamp.
        return None, [], "backfill grid says not_a_lineup (skip)"

    # 1-based → 0-based, clamped to the grid range. Falls back to first
    # index when the model omitted it (mirrors orchestrator's fallback).
    stand_idx = (result.best_stand_index or 1) - 1
    stand_idx = max(0, min(stand_idx, len(timestamps) - 1))
    return timestamps[stand_idx], [], result.reasoning or ""


async def _resolve_release_ts_via_throw_localizer(
    lineup: Lineup,
    video_path: Path,
    chapter_start: float,
    chapter_end: float,
) -> tuple[Optional[float], list[str], str]:
    """Backfill helper: run the throw-timing classifier to recover release_ts.

    Returns ``(release_ts, error_codes, reasoning)``. AIM_TS is then
    ``release_ts - _AIM_PRE_RELEASE_SECONDS`` in the caller. A non-throw or
    no-release verdict surfaces as ``([], reasoning)`` (skip cleanly) — the
    AIM clip is best-effort.
    """
    try:
        refined = await localize_throw_with_refinement(
            video_path,
            chapter_start=float(chapter_start),
            chapter_end=float(chapter_end),
            chapter_title=lineup.chapter_title or "",
            utility_hint=None,
        )
    except FrameExtractionError as exc:
        logger.warning(
            "micro_clip_helpers: throw localizer extract failed: "
            "lineup=%s returncode=%s stderr=%s",
            lineup.id, exc.returncode, exc.stderr[:300],
        )
        return None, [f"throw_localizer_extract:rc={exc.returncode}"], str(exc)
    except Exception as exc:  # defensive
        logger.warning(
            "micro_clip_helpers: throw localizer raised: lineup=%s error=%s",
            lineup.id, str(exc),
        )
        return None, [f"throw_localizer_raised:{type(exc).__name__}"], str(exc)

    timing = refined.timing
    if not timing.success:
        logger.warning(
            "micro_clip_helpers: throw localizer call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, timing.error_codes,
        )
        return None, list(timing.error_codes), "throw localizer reported failure"

    if not timing.is_lineup_throw or timing.release_index is None:
        return None, [], "throw localizer found no usable release frame"

    release_ts = refined.frame_timestamps[timing.release_index - 1]
    return release_ts, [], timing.reasoning or ""


async def _cut_upload_persist_one_side(
    db: AsyncSession,
    lineup: Lineup,
    video_id: str,
    local_video: Path,
    *,
    anchor_ts: float,
    clip_seconds: float,
    chapter_start: float,
    chapter_end: float,
    side: str,
    key_fn,
    persist_fn,
    wider_source_start_s: float | None = None,
    min_clip_seconds: float,
) -> dict:
    """Cut + upload + persist exactly ONE side (stand or aim).

    Returns a flat dict consumed by the generator — not a dataclass because
    the caller flattens the two sides into the composite
    ``MicroClipGenerationResult``. Same shape for both sides so a future
    third pane (unlikely) could be added without touching this function.

    *wider_source_start_s* is the seconds-into-source-video start of the
    SHARED wider clip (``clip_url_original``) the operator's shift-window
    slider will be positioned against. When set, this function computes
    ``offset_s = clip_start - wider_source_start_s`` and persists it via the
    setter's ``offset_s=`` kwarg. When None, offset is left untouched.
    """
    start = max(float(anchor_ts), float(chapter_start))
    end = min(start + float(clip_seconds), float(chapter_end))
    duration = end - start
    if duration < min_clip_seconds:
        return {
            "status": "skipped",
            "skip_reason": "chapter_too_short_for_microclip",
        }
    clip_start, clip_duration = start, duration

    try:
        clip_bytes = await cut_clip(local_video, clip_start, clip_duration)
    except ClipCutError as exc:
        logger.warning(
            "micro_clip_helpers: %s clip cut failed: lineup=%s video_id=%s "
            "start=%.2f dur=%.2f returncode=%s stderr=%s",
            side, lineup.id, video_id, clip_start, clip_duration,
            exc.returncode, exc.stderr[:300],
        )
        return {
            "status": "failed",
            "error_codes": [f"clip_cut:rc={exc.returncode}"],
        }

    clip_key = key_fn(video_id, chapter_start)
    try:
        storage = get_storage()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, storage.upload_file, clip_key, clip_bytes, "video/mp4"
        )
    except Exception as exc:
        logger.warning(
            "micro_clip_helpers: %s clip upload failed: lineup=%s key=%s "
            "error=%s",
            side, lineup.id, clip_key, str(exc),
        )
        return {
            "status": "failed",
            "error_codes": ["clip_upload_failed"],
        }

    offset_s: float | None = (
        clip_start - wider_source_start_s
        if wider_source_start_s is not None
        else None
    )

    try:
        await persist_fn(db, lineup, clip_key, offset_s=offset_s)
    except Exception as exc:
        # Object uploaded but column didn't commit. Key is deterministic so
        # backfill recomputes the same key and overwrites — no orphan.
        logger.warning(
            "micro_clip_helpers: %s_clip_url persist failed (object uploaded, "
            "column not committed; backfill is idempotent): lineup=%s key=%s "
            "error=%s",
            side, lineup.id, clip_key, str(exc),
        )
        return {
            "status": "failed",
            "error_codes": [f"{side}_clip_url_persist_failed"],
        }

    logger.info(
        "micro_clip_helpers: %s clip generated: lineup=%s video_id=%s "
        "key=%s anchor_ts=%.2f clip=[%.2f,+%.2fs]",
        side, lineup.id, video_id, clip_key, anchor_ts,
        clip_start, clip_duration,
    )
    return {"status": "generated", "clip_key": clip_key}
