"""Internal helpers for :mod:`micro_clip_generator` — kept in a sibling
module so the generator stays under the file-size growth guard (the
generator was already at the 500-LOC threshold; growth requires a
matching split per TECH_DEBT.md "no-growth on flagged files").

What lives here:
  - ``_resolve_release_ts_via_throw_localizer`` — backfill anchor source
    (AIM derives from this release_ts; STAND now uses its own
    localizer — see ``_resolve_stand_ts``).
  - ``_resolve_stand_ts`` — content-aware STAND anchor. Uses cached
    ``lineup.stand_ts`` when set; else runs the STAND-localizer (Claude)
    and persists the result. The fixed-offset
    ``release_ts − _STAND_PRE_RELEASE_SECONDS`` heuristic is gone
    (rules/no-bandaid-solutions.md — see operator pushback 2026-05-23).
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
    cut_clip,
)
from app.services.ingestion.stand_localizer import (
    localize_stand_with_refinement,
)
from app.services.ingestion.throw_localizer import (
    localize_throw_with_refinement,
)

logger = logging.getLogger(__name__)


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


async def _resolve_stand_ts(
    db: AsyncSession,
    lineup: Lineup,
    video_path: Path,
    *,
    chapter_start: float,
    release_ts: float,
) -> tuple[Optional[float], list[str], str]:
    """Resolve the content-aware STAND anchor for this lineup.

    Two paths:

    **Cached path** — ``lineup.stand_localized_at`` is set: the localizer
    has already run for this lineup. Returns ``lineup.stand_ts`` (which
    may be NULL — a previously-confirmed "no stand demo in this chapter"
    verdict). No Claude call. Operator NULLs ``stand_localized_at`` to
    force a re-localize.

    **Fresh path** — ``stand_localized_at`` is NULL: run the
    STAND-localizer two-stage Claude pass, persist
    ``stand_ts`` + ``stand_localized_at``. Returns the localized
    timestamp (or NULL on a confident "no demo" verdict).

    Returns ``(stand_ts, error_codes, reasoning)``. ``error_codes`` is
    populated only on a true failure (frame extract / Claude API);
    a "no demo" verdict returns ``(None, [], "...")``. The caller surfaces
    a STAND skip with reason ``stand_localizer_no_demo`` in that case.
    """
    if lineup.stand_localized_at is not None:
        # Cached — trust the prior verdict. NULL stand_ts means
        # "confirmed no demo" and propagates as a clean skip.
        return lineup.stand_ts, [], ""

    try:
        refined = await localize_stand_with_refinement(
            video_path,
            chapter_start=float(chapter_start),
            release_ts=float(release_ts),
            chapter_title=lineup.chapter_title or "",
            utility_hint=None,
        )
    except FrameExtractionError as exc:
        logger.warning(
            "micro_clip_helpers: stand localizer extract failed: "
            "lineup=%s returncode=%s stderr=%s",
            lineup.id, exc.returncode, exc.stderr[:300],
        )
        return None, [f"stand_localizer_extract:rc={exc.returncode}"], str(exc)
    except Exception as exc:  # defensive
        logger.warning(
            "micro_clip_helpers: stand localizer raised: lineup=%s error=%s",
            lineup.id, str(exc),
        )
        return None, [f"stand_localizer_raised:{type(exc).__name__}"], str(exc)

    timing = refined.timing
    if not timing.success:
        # API/parse failure — do NOT persist; next backfill retries.
        logger.warning(
            "micro_clip_helpers: stand localizer call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, timing.error_codes,
        )
        return None, list(timing.error_codes), "stand localizer reported failure"

    # Localizer ran cleanly — persist verdict (demo or no-demo) so the
    # cache hits on the next call.
    resolved_ts: Optional[float] = None
    if timing.has_stand_demonstration and timing.stand_index is not None:
        resolved_ts = refined.frame_timestamps[timing.stand_index - 1]

    try:
        await lineup_repo.set_stand_localization(
            db, lineup,
            stand_ts=resolved_ts,
            stand_localized_at=datetime.now(timezone.utc),
        )
    except Exception as exc:
        # Persistence failed — the Claude call succeeded; use the result
        # this run, log so the operator can investigate. Next run will
        # re-localize (no cache write happened).
        logger.warning(
            "micro_clip_helpers: stand_ts persist failed (Claude call "
            "succeeded; using value this run, will re-localize next "
            "backfill): lineup=%s error=%s",
            lineup.id, str(exc),
        )

    if resolved_ts is None:
        return None, [], timing.reasoning or "stand localizer found no demo"
    return resolved_ts, [], timing.reasoning or ""


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
