"""AIM localizer — two-stage aim-demonstration frame refinement.

Replaces the abandoned ``release_ts − _AIM_PRE_RELEASE_SECONDS`` fixed-
offset heuristic (0.8s constant) for anchoring the AIM micro-clip. The
constant approach could not generalise across utilities whose windup
animations vary in length (HE ~0.4s, smoke ~0.5s, Molotov ~0.9s) — see
operator pushback 2026-05-24 ("the AIM clip is showing the END of the
throw animation") and rules/no-bandaid-solutions.md. Bumping the offset
just shifts the failure mode; the heuristic SHAPE (fixed pre-release
offset) is wrong.

This module wraps :func:`classify_aim_timing_from_frames` with the same
two-stage pattern as :mod:`stand_localizer` and :mod:`throw_localizer`:

  Stage 1 — coarse pass:
    * Sample N=12 frames evenly across
      ``[chapter_start, release_ts − _COARSE_PRE_WINDUP_PAD_SECONDS]``
      (the entire pre-windup window — an aim demo can be early,
      middle, or late within it).
    * Run the AIM classifier; get a coarse ``aim_index``.

  Stage 2 — dense pass (only when Stage 1 cleared the confidence gate):
    * Sample N=8 frames in a symmetric ±1.5s window around the coarse
      ``aim_ts``.
    * Run the classifier again; tighter spacing → frame-accurate pick.

Unlike :mod:`stand_localizer` (which uses a 0.3s pre-release pad), AIM
uses a 0.6s pre-WINDUP pad: windup motion typically begins 0.4–0.9s
before release, so pulling the coarse upper bound back by 0.6s keeps the
last coarse frame safely BEFORE windup starts. The classifier would
exclude windup frames anyway (per its prompt), but pre-trimming spends
fewer Claude tokens on excluded frames AND avoids edge picks that
straddle the start of the windup.

Like :mod:`stand_localizer` and unlike :mod:`throw_localizer`, AIM's
dense window is symmetric: a locked-aim demonstration is a diffuse
"settled" moment, not a transition between two events.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): a dense-pass failure NEVER
regresses to the heuristic — falls back to coarse. A confident
``has_aim_demonstration=False`` at the coarse stage is a SUCCESSFUL
"no demo" answer and propagates upward; the caller skips the AIM clip
and shows the still rather than fabricate a fallback anchor.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.classification.aim_timing_classifier import (
    classify_aim_timing_from_frames,
)
from app.services.classification.classification_result import AimTimingResult
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    extract_frames_downscaled,
    grid_timestamps,
)

logger = logging.getLogger(__name__)


# Refine only when the coarse pass cleared this confidence gate. Below,
# we don't trust the coarse pick enough to spend a second Claude call
# tightening it. Mirrors :data:`stand_localizer._REFINE_CONFIDENCE_GATE`.
_REFINE_CONFIDENCE_GATE = 0.55

# Coarse-window frame count — same shape as stand_localizer / throw_localizer.
_COARSE_FRAME_COUNT = 12

# Coarse-window padding from the release_ts. Keeps the LAST coarse frame
# safely BEFORE the start of windup motion. Windup typically begins
# 0.4–0.9s before release (varies by utility — HE shorter, Molotov
# longer); 0.6s sits inside that range so the last coarse frame is
# pre-windup for most utilities. Larger than STAND's 0.3s pad because
# STAND's prompt only excludes mid-windup/mid-throw frames whereas AIM's
# prompt excludes the entire pre-release windup arc — pulling further
# back lets the classifier focus on the locked-aim settled interval.
_COARSE_PRE_WINDUP_PAD_SECONDS = 0.6

# Symmetric dense window around the coarse aim_ts. The locked-aim demo is
# a diffuse "settled" moment — symmetric is right (unlike throw_localizer's
# asymmetric window which extends post-release to catch the result).
_DENSE_HALF_WINDOW_SECONDS = 1.5
_DENSE_FRAME_COUNT = 8

# Don't bother refining if chapter-boundary clamping leaves the dense
# window with fewer than this many candidates — too few to meaningfully
# tighten the pick. Coarse is already 12 frames so anything under ~4
# dense is a regression.
_MIN_DENSE_FRAMES = 4

# Diagnostic stage labels — surfaced on RefinedAimTiming.stage for
# logging / metrics. Keep stable for log-grepping.
STAGE_REFINED = "refined"
STAGE_COARSE_ONLY = "coarse_only"
STAGE_COARSE_BELOW_GATE = "coarse_below_refine_gate"
STAGE_COARSE_NO_AIM_INDEX = "coarse_no_aim_index"
STAGE_COARSE_NO_DEMO = "coarse_no_aim_demonstration"
STAGE_COARSE_FAILED = "coarse_failed"
STAGE_COARSE_WINDOW_TOO_SMALL = "coarse_window_too_small"
STAGE_DENSE_WINDOW_TOO_SMALL = "dense_window_too_small"
STAGE_DENSE_EXTRACT_FAILED = "dense_extract_failed"
STAGE_DENSE_REJECTED = "dense_rejected"


@dataclass
class RefinedAimTiming:
    """Return shape of :func:`localize_aim_with_refinement`.

    ``timing`` is the AimTimingResult the caller treats as the final
    answer — dense when refinement succeeded, otherwise coarse.
    ``frame_timestamps`` is the timestamp list whose 1-based indices the
    caller maps ``timing.aim_index`` back to.

    ``stage`` and ``coarse_timing`` are diagnostics (logs / future
    metrics) — populated even on the happy path so a log scan can
    answer "of N localizations, how many cleared the refine gate, how
    many fell back".
    """

    timing: AimTimingResult
    frame_timestamps: list[float]
    stage: str
    coarse_timing: Optional[AimTimingResult] = None


def coarse_window_timestamps(
    chapter_start: float,
    release_ts: float,
    *,
    n: int = _COARSE_FRAME_COUNT,
    pre_windup_pad_seconds: float = _COARSE_PRE_WINDUP_PAD_SECONDS,
) -> list[float]:
    """Coarse-pass timestamps for Stage 1 of AIM localization.

    Spans the entire pre-windup window ``[chapter_start, release_ts −
    pre_windup_pad]``. A locked-aim demo can be early (immediately after
    the stand demo), middle (held steady while narrator talks), or late
    (final pixel-tweak just before windup) — the coarse pass needs to
    catch all of them.

    Returns the coarse timestamp list (length N at most; fewer when the
    pre-windup window is very short — see grid_timestamps).
    """
    hi = max(float(chapter_start), float(release_ts) - pre_windup_pad_seconds)
    lo = float(chapter_start)
    if hi <= lo:
        # Degenerate: release is at (or before) chapter_start + pad.
        # Caller surfaces this as "no usable window".
        return []
    # edge_padding_seconds=0 — the pre-windup pad already pulls us back
    # from the release; padding the start trims candidate range without
    # benefit because the chapter_start IS the start.
    return grid_timestamps(lo, hi, n, edge_padding_seconds=0.0)


def dense_window_timestamps(
    coarse_aim_ts: float,
    chapter_start: float,
    release_ts: float,
    *,
    half_window_seconds: float = _DENSE_HALF_WINDOW_SECONDS,
    n: int = _DENSE_FRAME_COUNT,
    pre_windup_pad_seconds: float = _COARSE_PRE_WINDUP_PAD_SECONDS,
) -> list[float]:
    """Dense-pass timestamps for Stage 2 of AIM localization.

    Symmetric ±half_window around the coarse-pass aim_ts, clamped to
    ``[chapter_start, release_ts − pre_windup_pad]`` so dense candidates
    never bleed into the windup window. Returns the timestamp list
    (length N at most).
    """
    lo = max(float(chapter_start), float(coarse_aim_ts) - half_window_seconds)
    hi = min(
        float(release_ts) - pre_windup_pad_seconds,
        float(coarse_aim_ts) + half_window_seconds,
    )
    if hi <= lo:
        return []
    return grid_timestamps(lo, hi, n, edge_padding_seconds=0.0)


def _should_refine(coarse: AimTimingResult) -> Optional[str]:
    """Return None if refinement should proceed, else the SKIP stage label."""
    if not coarse.success:
        return STAGE_COARSE_FAILED
    if not coarse.has_aim_demonstration:
        return STAGE_COARSE_NO_DEMO
    if coarse.aim_index is None:
        return STAGE_COARSE_NO_AIM_INDEX
    if coarse.confidence is None or coarse.confidence < _REFINE_CONFIDENCE_GATE:
        return STAGE_COARSE_BELOW_GATE
    return None


async def localize_aim_with_refinement(
    video_path: Path,
    *,
    chapter_start: float,
    release_ts: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str] = None,
) -> RefinedAimTiming:
    """Localise the AIM demonstration with optional dense-pass refinement.

    Args:
        video_path: Local source video file. Caller owns its lifecycle.
        chapter_start: Source chapter start in seconds.
        release_ts: Seconds-into-source-video where the throw is released
            (from the throw-localizer's dense pass). Used as the upper
            bound of the pre-windup search window — AIM demos must
            precede the windup which itself precedes the release.
        chapter_title: Per-call context surfaced to Claude.
        utility_hint: Optional utility slug from a prior grid
            classification at confidence > 0.6.
    """
    chapter_duration = float(release_ts) - float(chapter_start)

    # ---- Stage 1: coarse pass --------------------------------------------
    coarse_timestamps = coarse_window_timestamps(chapter_start, release_ts)
    if not coarse_timestamps:
        # Release is at or before chapter_start + pad — no pre-windup
        # window. Return a confident "no demo" rather than an error:
        # this is a data-shape issue, not a Claude failure.
        logger.info(
            "aim_localizer: stage=%s chapter_start=%.2f release_ts=%.2f "
            "chapter=%r",
            STAGE_COARSE_WINDOW_TOO_SMALL,
            chapter_start, release_ts, chapter_title,
        )
        no_window = AimTimingResult(
            success=True,
            has_aim_demonstration=False,
            aim_index=None,
            confidence=None,
            reasoning=(
                "No pre-windup window: release_ts is at/before "
                "chapter_start + pre-windup pad"
            ),
            error_codes=[STAGE_COARSE_WINDOW_TOO_SMALL],
        )
        return RefinedAimTiming(
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
            "aim_localizer: coarse frame extraction failed: video=%s "
            "returncode=%s stderr=%s",
            video_path, exc.returncode, exc.stderr[:200],
        )
        raise

    coarse = await classify_aim_timing_from_frames(
        frames=coarse_frames,
        frame_timestamps=coarse_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    skip_stage = _should_refine(coarse)
    if skip_stage is not None:
        logger.info(
            "aim_localizer: stage=%s coarse_success=%s "
            "has_aim_demonstration=%s aim_index=%s confidence=%s "
            "chapter=%r",
            skip_stage,
            coarse.success,
            coarse.has_aim_demonstration,
            coarse.aim_index,
            coarse.confidence,
            chapter_title,
        )
        return RefinedAimTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=skip_stage,
            coarse_timing=coarse,
        )

    # ---- Stage 2: dense refinement ---------------------------------------
    assert coarse.aim_index is not None  # for type checker
    coarse_aim_ts = coarse_timestamps[coarse.aim_index - 1]
    dense_timestamps = dense_window_timestamps(
        coarse_aim_ts, chapter_start, release_ts
    )

    if len(dense_timestamps) < _MIN_DENSE_FRAMES:
        logger.info(
            "aim_localizer: stage=%s coarse_aim_ts=%.2f dense_n=%d "
            "(< %d); returning coarse: chapter=%r",
            STAGE_DENSE_WINDOW_TOO_SMALL,
            coarse_aim_ts,
            len(dense_timestamps),
            _MIN_DENSE_FRAMES,
            chapter_title,
        )
        return RefinedAimTiming(
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
            "aim_localizer: stage=%s coarse_aim_ts=%.2f returncode=%s "
            "stderr=%s; returning coarse: chapter=%r",
            STAGE_DENSE_EXTRACT_FAILED,
            coarse_aim_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return RefinedAimTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_EXTRACT_FAILED,
            coarse_timing=coarse,
        )

    dense = await classify_aim_timing_from_frames(
        frames=dense_frames,
        frame_timestamps=dense_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    if (
        not dense.success
        or not dense.has_aim_demonstration
        or dense.aim_index is None
    ):
        logger.info(
            "aim_localizer: stage=%s coarse_aim_ts=%.2f "
            "dense_success=%s dense_has_demo=%s dense_aim_index=%s; "
            "returning coarse: chapter=%r",
            STAGE_DENSE_REJECTED,
            coarse_aim_ts,
            dense.success,
            dense.has_aim_demonstration,
            dense.aim_index,
            chapter_title,
        )
        return RefinedAimTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_REJECTED,
            coarse_timing=coarse,
        )

    dense_aim_ts = dense_timestamps[dense.aim_index - 1]
    logger.info(
        "aim_localizer: stage=%s coarse_aim_ts=%.2f dense_aim_ts=%.2f "
        "shift=%+.2fs coarse_conf=%.2f dense_conf=%.2f chapter=%r",
        STAGE_REFINED,
        coarse_aim_ts,
        dense_aim_ts,
        dense_aim_ts - coarse_aim_ts,
        coarse.confidence or 0.0,
        dense.confidence or 0.0,
        chapter_title,
    )
    return RefinedAimTiming(
        timing=dense,
        frame_timestamps=dense_timestamps,
        stage=STAGE_REFINED,
        coarse_timing=coarse,
    )
