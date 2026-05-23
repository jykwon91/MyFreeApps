"""STAND localizer — two-stage stand-demonstration frame refinement.

Replaces the abandoned ``release_ts − _STAND_PRE_RELEASE_SECONDS`` fixed-
offset heuristic for anchoring the STAND micro-clip. The constant
approach (3.0s, briefly 7.0s) could not generalize across tutorial
styles — see operator pushback 2026-05-23 ("i don't think this will
apply to every video though") and rules/no-bandaid-solutions.md.

This module wraps :func:`classify_stand_timing_from_frames` with the
same two-stage pattern as :mod:`throw_localizer`:

  Stage 1 — coarse pass:
    * Sample N=12 frames evenly across ``[chapter_start, release_ts]``
      (the entire pre-release window — a demo can be early, middle, or
      late).
    * Run the STAND classifier; get a coarse ``stand_index``.

  Stage 2 — dense pass (only when Stage 1 cleared the confidence gate):
    * Sample N=8 frames in a symmetric ±1.5s window around the coarse
      ``stand_ts``.
    * Run the classifier again; tighter spacing → frame-accurate pick.

Unlike :mod:`throw_localizer` (asymmetric -1.0s/+3.0s window because
release → result spans that range), STAND's dense window is symmetric:
the demo is a diffuse moment, not a transition between two events.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): a dense-pass failure NEVER
regresses to the heuristic — falls back to coarse. A confident
``has_stand_demonstration=False`` at the coarse stage is a SUCCESSFUL
"no demo" answer and propagates upward; the caller skips the STAND
clip and shows the still rather than fabricate a fallback anchor.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.classification.classification_result import StandTimingResult
from app.services.classification.stand_timing_classifier import (
    classify_stand_timing_from_frames,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    extract_frames_downscaled,
    grid_timestamps,
)

logger = logging.getLogger(__name__)


# Refine only when the coarse pass cleared this confidence gate. Below,
# we don't trust the coarse pick enough to spend a second Claude call
# tightening it. Mirrors :data:`throw_localizer._REFINE_CONFIDENCE_GATE`.
_REFINE_CONFIDENCE_GATE = 0.55

# Coarse-window frame count — same shape as throw_localizer.
_COARSE_FRAME_COUNT = 12

# Coarse-window padding from the release_ts. Keeps the LAST coarse frame
# safely BEFORE release so a marginal coarse pick at the edge isn't on a
# windup frame (which the prompt would exclude anyway, but pre-trimming
# spends fewer Claude tokens on excluded frames).
_COARSE_PRE_RELEASE_PAD_SECONDS = 0.3

# Symmetric dense window around the coarse stand_ts. The demo is a
# diffuse moment — symmetric is right (unlike throw_localizer's
# asymmetric window which extends post-release to catch the result).
_DENSE_HALF_WINDOW_SECONDS = 1.5
_DENSE_FRAME_COUNT = 8

# Don't bother refining if chapter-boundary clamping leaves the dense
# window with fewer than this many candidates — too few to meaningfully
# tighten the pick. Coarse is already 12 frames so anything under ~4
# dense is a regression.
_MIN_DENSE_FRAMES = 4

# Diagnostic stage labels — surfaced on RefinedStandTiming.stage for
# logging / metrics. Keep stable for log-grepping.
STAGE_REFINED = "refined"
STAGE_COARSE_ONLY = "coarse_only"
STAGE_COARSE_BELOW_GATE = "coarse_below_refine_gate"
STAGE_COARSE_NO_STAND_INDEX = "coarse_no_stand_index"
STAGE_COARSE_NO_DEMO = "coarse_no_stand_demonstration"
STAGE_COARSE_FAILED = "coarse_failed"
STAGE_COARSE_WINDOW_TOO_SMALL = "coarse_window_too_small"
STAGE_DENSE_WINDOW_TOO_SMALL = "dense_window_too_small"
STAGE_DENSE_EXTRACT_FAILED = "dense_extract_failed"
STAGE_DENSE_REJECTED = "dense_rejected"


@dataclass
class RefinedStandTiming:
    """Return shape of :func:`localize_stand_with_refinement`.

    ``timing`` is the StandTimingResult the caller treats as the final
    answer — dense when refinement succeeded, otherwise coarse.
    ``frame_timestamps`` is the timestamp list whose 1-based indices the
    caller maps ``timing.stand_index`` back to.

    ``stage`` and ``coarse_timing`` are diagnostics (logs / future
    metrics) — populated even on the happy path so a log scan can
    answer "of N localizations, how many cleared the refine gate, how
    many fell back".
    """

    timing: StandTimingResult
    frame_timestamps: list[float]
    stage: str
    coarse_timing: Optional[StandTimingResult] = None


def coarse_window_timestamps(
    chapter_start: float,
    release_ts: float,
    *,
    n: int = _COARSE_FRAME_COUNT,
    pre_release_pad_seconds: float = _COARSE_PRE_RELEASE_PAD_SECONDS,
) -> list[float]:
    """Coarse-pass timestamps for Stage 1 of STAND localization.

    Spans the entire pre-release window ``[chapter_start, release_ts −
    pre_release_pad]``. A demo can be early (right after chapter start),
    middle (after explanation), or late (just before aim windup) — the
    coarse pass needs to catch all of them.

    Returns the coarse timestamp list (length N at most; fewer when the
    pre-release window is very short — see grid_timestamps).
    """
    hi = max(float(chapter_start), float(release_ts) - pre_release_pad_seconds)
    lo = float(chapter_start)
    if hi <= lo:
        # Degenerate: release is at (or before) chapter_start. Caller
        # surfaces this as "no usable window".
        return []
    # edge_padding_seconds=0 — the pre-release pad already pulls us back
    # from the release; padding the start trims candidate range without
    # benefit because the chapter_start IS the start.
    return grid_timestamps(lo, hi, n, edge_padding_seconds=0.0)


def dense_window_timestamps(
    coarse_stand_ts: float,
    chapter_start: float,
    release_ts: float,
    *,
    half_window_seconds: float = _DENSE_HALF_WINDOW_SECONDS,
    n: int = _DENSE_FRAME_COUNT,
    pre_release_pad_seconds: float = _COARSE_PRE_RELEASE_PAD_SECONDS,
) -> list[float]:
    """Dense-pass timestamps for Stage 2 of STAND localization.

    Symmetric ±half_window around the coarse-pass stand_ts, clamped to
    ``[chapter_start, release_ts − pre_release_pad]`` so dense candidates
    never bleed into the windup window. Returns the timestamp list
    (length N at most).
    """
    lo = max(float(chapter_start), float(coarse_stand_ts) - half_window_seconds)
    hi = min(
        float(release_ts) - pre_release_pad_seconds,
        float(coarse_stand_ts) + half_window_seconds,
    )
    if hi <= lo:
        return []
    return grid_timestamps(lo, hi, n, edge_padding_seconds=0.0)


def _should_refine(coarse: StandTimingResult) -> Optional[str]:
    """Return None if refinement should proceed, else the SKIP stage label."""
    if not coarse.success:
        return STAGE_COARSE_FAILED
    if not coarse.has_stand_demonstration:
        return STAGE_COARSE_NO_DEMO
    if coarse.stand_index is None:
        return STAGE_COARSE_NO_STAND_INDEX
    if coarse.confidence is None or coarse.confidence < _REFINE_CONFIDENCE_GATE:
        return STAGE_COARSE_BELOW_GATE
    return None


async def localize_stand_with_refinement(
    video_path: Path,
    *,
    chapter_start: float,
    release_ts: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str] = None,
) -> RefinedStandTiming:
    """Localise the STAND demonstration with optional dense-pass refinement.

    Args:
        video_path: Local source video file. Caller owns its lifecycle.
        chapter_start: Source chapter start in seconds.
        release_ts: Seconds-into-source-video where the throw is released
            (from the throw-localizer's dense pass). Used as the upper
            bound of the pre-release search window — STAND demos must
            precede the throw.
        chapter_title: Per-call context surfaced to Claude.
        utility_hint: Optional utility slug from a prior grid
            classification at confidence > 0.6.
    """
    chapter_duration = float(release_ts) - float(chapter_start)

    # ---- Stage 1: coarse pass --------------------------------------------
    coarse_timestamps = coarse_window_timestamps(chapter_start, release_ts)
    if not coarse_timestamps:
        # Release is at or before chapter_start — no pre-release window.
        # Return a confident "no demo" rather than an error: this is a
        # data-shape issue, not a Claude failure.
        logger.info(
            "stand_localizer: stage=%s chapter_start=%.2f release_ts=%.2f "
            "chapter=%r",
            STAGE_COARSE_WINDOW_TOO_SMALL,
            chapter_start, release_ts, chapter_title,
        )
        no_window = StandTimingResult(
            success=True,
            has_stand_demonstration=False,
            stand_index=None,
            confidence=None,
            reasoning=(
                "No pre-release window: release_ts is at/before chapter_start"
            ),
            error_codes=[STAGE_COARSE_WINDOW_TOO_SMALL],
        )
        return RefinedStandTiming(
            timing=no_window,
            frame_timestamps=[],
            stage=STAGE_COARSE_WINDOW_TOO_SMALL,
            coarse_timing=no_window,
        )

    try:
        coarse_frames = await extract_frames_downscaled(
            video_path, coarse_timestamps
        )
    except FrameExtractionError as exc:
        logger.warning(
            "stand_localizer: coarse frame extraction failed: video=%s "
            "returncode=%s stderr=%s",
            video_path, exc.returncode, exc.stderr[:200],
        )
        raise

    coarse = await classify_stand_timing_from_frames(
        frames=coarse_frames,
        frame_timestamps=coarse_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    skip_stage = _should_refine(coarse)
    if skip_stage is not None:
        logger.info(
            "stand_localizer: stage=%s coarse_success=%s "
            "has_stand_demonstration=%s stand_index=%s confidence=%s "
            "chapter=%r",
            skip_stage,
            coarse.success,
            coarse.has_stand_demonstration,
            coarse.stand_index,
            coarse.confidence,
            chapter_title,
        )
        return RefinedStandTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=skip_stage,
            coarse_timing=coarse,
        )

    # ---- Stage 2: dense refinement ---------------------------------------
    assert coarse.stand_index is not None  # for type checker
    coarse_stand_ts = coarse_timestamps[coarse.stand_index - 1]
    dense_timestamps = dense_window_timestamps(
        coarse_stand_ts, chapter_start, release_ts
    )

    if len(dense_timestamps) < _MIN_DENSE_FRAMES:
        logger.info(
            "stand_localizer: stage=%s coarse_stand_ts=%.2f dense_n=%d "
            "(< %d); returning coarse: chapter=%r",
            STAGE_DENSE_WINDOW_TOO_SMALL,
            coarse_stand_ts,
            len(dense_timestamps),
            _MIN_DENSE_FRAMES,
            chapter_title,
        )
        return RefinedStandTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_WINDOW_TOO_SMALL,
            coarse_timing=coarse,
        )

    try:
        dense_frames = await extract_frames_downscaled(
            video_path, dense_timestamps
        )
    except FrameExtractionError as exc:
        logger.warning(
            "stand_localizer: stage=%s coarse_stand_ts=%.2f returncode=%s "
            "stderr=%s; returning coarse: chapter=%r",
            STAGE_DENSE_EXTRACT_FAILED,
            coarse_stand_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return RefinedStandTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_EXTRACT_FAILED,
            coarse_timing=coarse,
        )

    dense = await classify_stand_timing_from_frames(
        frames=dense_frames,
        frame_timestamps=dense_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    if (
        not dense.success
        or not dense.has_stand_demonstration
        or dense.stand_index is None
    ):
        logger.info(
            "stand_localizer: stage=%s coarse_stand_ts=%.2f "
            "dense_success=%s dense_has_demo=%s dense_stand_index=%s; "
            "returning coarse: chapter=%r",
            STAGE_DENSE_REJECTED,
            coarse_stand_ts,
            dense.success,
            dense.has_stand_demonstration,
            dense.stand_index,
            chapter_title,
        )
        return RefinedStandTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_REJECTED,
            coarse_timing=coarse,
        )

    dense_stand_ts = dense_timestamps[dense.stand_index - 1]
    logger.info(
        "stand_localizer: stage=%s coarse_stand_ts=%.2f dense_stand_ts=%.2f "
        "shift=%+.2fs coarse_conf=%.2f dense_conf=%.2f chapter=%r",
        STAGE_REFINED,
        coarse_stand_ts,
        dense_stand_ts,
        dense_stand_ts - coarse_stand_ts,
        coarse.confidence or 0.0,
        dense.confidence or 0.0,
        chapter_title,
    )
    return RefinedStandTiming(
        timing=dense,
        frame_timestamps=dense_timestamps,
        stage=STAGE_REFINED,
        coarse_timing=coarse,
    )
