"""Throw localizer — two-stage release-frame refinement.

The clip pipeline's coarse pass samples N=12 frames over a 30-180s chapter
window, putting frames roughly 2-15 seconds apart. Even a perfect classifier
prompt cannot pick a frame the sampler never extracted — so the final clip
anchor is at best "release ± 1.5s" on a typical chapter. That cadence is the
underlying defect; PR #749 / #750 only chip at its symptoms.

This module wraps :func:`classify_throw_timing_from_frames` with a second
dense pass once the coarse pass has localised the throw to a particular
region of the chapter:

  Stage 1 — coarse pass (unchanged):
    * ``clip_window_timestamps`` builds the trimmed throw window
    * ``extract_frames_downscaled`` pulls those 12 frames
    * ``classify_throw_timing_from_frames`` returns a coarse
      ``release_index``

  Stage 2 — dense pass (NEW, only when Stage 1 cleared its gate):
    * ``dense_window_timestamps`` builds 8 frames at ~0.5s spacing,
      asymmetric around coarse-release (more post-release coverage for the
      result frame too)
    * ``extract_frames_downscaled`` pulls those 8 frames
    * ``classify_throw_timing_from_frames`` runs a SECOND time with the
      tighter set — returns a frame-accurate release/result on the same
      ThrowTimingResult schema

The orchestrator returns the dense result when the dense pass succeeded,
otherwise the coarse result. Either way the caller gets back the
``frame_timestamps`` the returned indices map back to, so it can do
``timestamps[release_index - 1]`` exactly as before. The caller is
otherwise unchanged.

The refinement gate matches the clip pipeline's existing 0.55 confidence
threshold:
  * If coarse is below 0.55, the clip would have been skipped anyway —
    a dense pass over a wrongly-localised coarse region would burn a
    second Claude call for no expected gain, and the cost is real on a
    casual / single-user app (see project_mygamingassistant_plan ⇒
    "App posture"). Skip the refinement.
  * If coarse is at or above 0.55, the dense window is centred on a
    release the model is confident about — refining is high-value:
    "release ± 1.5s" becomes "release ± 0.25s".

Cost: refinement doubles the throw-timing Claude calls per generated
clip (one coarse + one dense). Non-generated clips (gated out by
not-a-throw / low confidence / no release) pay only the coarse call as
before — the gating is the cost control. Net effect at typical accept
rates is ~1.7-1.9× of pre-refinement cost on clip-generation calls.

Failure handling (per rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): the dense pass can ONLY improve
the result; any dense-pass failure falls through to the coarse pass
result so the clip pipeline never regresses. The diagnostic ``stage``
field carries which path was taken.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.classification.classification_result import ThrowTimingResult
from app.services.classification.classifier_service import (
    classify_throw_timing_from_frames,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    clip_window_timestamps,
    extract_frames_downscaled,
    grid_timestamps,
)

logger = logging.getLogger(__name__)

# Refine only when the coarse pass cleared the clip-pipeline confidence
# gate. Below this we don't trust the coarse release region enough to
# spend a second Claude call densely sampling around it (and the clip
# would be skipped anyway — see module docstring).
_REFINE_CONFIDENCE_GATE = 0.55

# Dense window shape around the coarse-pass release frame. Asymmetric:
# more post-release coverage so the dense pass also catches the result
# frame (typical SMOKE result is 1.5-3.0s after release). Total window
# is 4s with N=8 → 0.5s spacing between dense candidates.
_DENSE_PRE_RELEASE_SECONDS = 1.0
_DENSE_POST_RELEASE_SECONDS = 3.0
_DENSE_FRAME_COUNT = 8

# Don't bother refining if chapter-boundary clamping leaves the dense
# window with fewer than this many candidates — too few to meaningfully
# tighten the release frame. Coarse is already 12 frames so anything
# under ~4 dense is a regression.
_MIN_DENSE_FRAMES = 4

# Diagnostic stage labels — surfaced on RefinedThrowTiming.stage for
# logging / metrics. Each maps to a specific reason the dense pass was
# (or wasn't) used. Keep stable for log-grepping.
STAGE_REFINED = "refined"
STAGE_COARSE_ONLY = "coarse_only"
STAGE_COARSE_BELOW_GATE = "coarse_below_refine_gate"
STAGE_COARSE_NO_RELEASE = "coarse_no_release_index"
STAGE_COARSE_NOT_A_THROW = "coarse_not_a_throw"
STAGE_COARSE_FAILED = "coarse_failed"
STAGE_DENSE_WINDOW_TOO_SMALL = "dense_window_too_small"
STAGE_DENSE_EXTRACT_FAILED = "dense_extract_failed"
STAGE_DENSE_CLASSIFIER_FAILED = "dense_classifier_failed"
STAGE_DENSE_REJECTED = "dense_rejected"


@dataclass
class RefinedThrowTiming:
    """Return shape of :func:`localize_throw_with_refinement`.

    ``timing`` is the ThrowTimingResult the caller should treat as the
    final answer — dense when the refinement succeeded, otherwise coarse.
    ``frame_timestamps`` is the timestamp list whose 1-based indices the
    caller maps ``timing.release_index`` / ``timing.result_index`` back to.

    ``stage`` and ``coarse_timing`` are diagnostics (logs / future
    metrics). Always populated so a log scan can answer "of N clip
    generations, how many cleared the refine gate, how many fell back".
    """

    timing: ThrowTimingResult
    frame_timestamps: list[float]
    stage: str
    coarse_timing: Optional[ThrowTimingResult] = None


def dense_window_timestamps(
    coarse_release_ts: float,
    chapter_start: float,
    chapter_end: float,
    *,
    pre_release_seconds: float = _DENSE_PRE_RELEASE_SECONDS,
    post_release_seconds: float = _DENSE_POST_RELEASE_SECONDS,
    n: int = _DENSE_FRAME_COUNT,
) -> list[float]:
    """Dense-pass timestamps for Stage 2 of two-stage refinement.

    Builds an asymmetric window around the coarse-pass release frame
    (more weight post-release so the dense pass also catches the result),
    then evenly spaces *n* timestamps across it. Clamped to the chapter
    bounds so a release near the chapter start/end doesn't sample frames
    outside the source video.

    Returns the dense timestamp list (length N at most, fewer when the
    clamped window collapses below N items via grid_timestamps's
    degenerate-window behaviour — see its docstring).
    """
    lo = max(float(chapter_start), float(coarse_release_ts) - pre_release_seconds)
    hi = min(float(chapter_end), float(coarse_release_ts) + post_release_seconds)
    if hi <= lo:
        # Chapter is degenerate or the release is outside the chapter — no
        # dense window possible. Caller will fall back to coarse.
        return []
    # edge_padding_seconds=0.0 — dense window is already pre-trimmed,
    # don't pull MORE padding off it (would lose candidates near release
    # for tight chapters).
    return grid_timestamps(lo, hi, n, edge_padding_seconds=0.0)


def _should_refine(coarse: ThrowTimingResult) -> Optional[str]:
    """Return None if refinement should proceed, else the SKIP stage label.

    Centralises the gate-decision so the orchestrator stays linear and
    so tests can pin the decision rules independently.
    """
    if not coarse.success:
        return STAGE_COARSE_FAILED
    if not coarse.is_lineup_throw:
        return STAGE_COARSE_NOT_A_THROW
    if coarse.release_index is None:
        return STAGE_COARSE_NO_RELEASE
    if coarse.confidence is None or coarse.confidence < _REFINE_CONFIDENCE_GATE:
        return STAGE_COARSE_BELOW_GATE
    return None


async def localize_throw_with_refinement(
    video_path: Path,
    *,
    chapter_start: float,
    chapter_end: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str] = None,
) -> RefinedThrowTiming:
    """Localise the throw with optional dense-pass refinement.

    See module docstring for the two-stage design. Always returns a
    RefinedThrowTiming — the dense result when the refine pass succeeded,
    otherwise the coarse result. The caller can treat the returned
    ``timing`` exactly as it would treat ``classify_throw_timing_from_frames``'s
    raw result (same dataclass, same gate semantics), and use
    ``frame_timestamps`` to map the returned indices back to seconds.

    Args:
        video_path: Local source video file. Caller owns its lifecycle
            (download / cleanup); this function only reads from it.
        chapter_start / chapter_end: Source chapter bounds in seconds.
        chapter_title: Per-call context surfaced to Claude.
        utility_hint: Optional utility slug from a prior grid
            classification at confidence > 0.6.
    """
    chapter_duration = float(chapter_end) - float(chapter_start)

    # ---- Stage 1: coarse pass (existing behaviour) ----------------------
    coarse_timestamps = clip_window_timestamps(chapter_start, chapter_end)

    try:
        coarse_frames = await extract_frames_downscaled(
            video_path, coarse_timestamps
        )
    except FrameExtractionError as exc:
        # Caller's existing FrameExtractionError handling lives in
        # clip_generator / landing_clip_generator. Re-raise so they can
        # surface structured codes (this function does not own the failure
        # surface for downscale-extract; the callers do).
        logger.warning(
            "throw_localizer: coarse frame extraction failed: video=%s "
            "returncode=%s stderr=%s",
            video_path, exc.returncode, exc.stderr[:200],
        )
        raise

    coarse = await classify_throw_timing_from_frames(
        frames=coarse_frames,
        frame_timestamps=coarse_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    skip_stage = _should_refine(coarse)
    if skip_stage is not None:
        # Coarse pass cleared no gate we'd refine through — return as-is.
        logger.info(
            "throw_localizer: stage=%s coarse_success=%s "
            "is_lineup_throw=%s release_index=%s confidence=%s "
            "chapter=%r",
            skip_stage,
            coarse.success,
            coarse.is_lineup_throw,
            coarse.release_index,
            coarse.confidence,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=skip_stage,
            coarse_timing=coarse,
        )

    # ---- Stage 2: dense refinement ---------------------------------------
    # release_index is non-None (gated above); resolve to a timestamp.
    assert coarse.release_index is not None  # for type checker
    coarse_release_ts = coarse_timestamps[coarse.release_index - 1]
    dense_timestamps = dense_window_timestamps(
        coarse_release_ts, chapter_start, chapter_end
    )

    if len(dense_timestamps) < _MIN_DENSE_FRAMES:
        logger.info(
            "throw_localizer: stage=%s coarse_release_ts=%.2f "
            "dense_n=%d (< %d); returning coarse: chapter=%r",
            STAGE_DENSE_WINDOW_TOO_SMALL,
            coarse_release_ts,
            len(dense_timestamps),
            _MIN_DENSE_FRAMES,
            chapter_title,
        )
        return RefinedThrowTiming(
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
        # A dense-pass extraction failure must NEVER regress the pipeline:
        # the coarse result already cleared the clip gates and is the
        # right thing to use. Log so we can see how often this happens.
        logger.warning(
            "throw_localizer: stage=%s coarse_release_ts=%.2f "
            "returncode=%s stderr=%s; returning coarse: chapter=%r",
            STAGE_DENSE_EXTRACT_FAILED,
            coarse_release_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_EXTRACT_FAILED,
            coarse_timing=coarse,
        )

    dense = await classify_throw_timing_from_frames(
        frames=dense_frames,
        frame_timestamps=dense_timestamps,
        chapter_title=chapter_title,
        chapter_duration=chapter_duration,
        utility_hint=utility_hint,
    )

    # The dense pass must produce a usable, throw-positive answer with a
    # release_index. Any miss falls back to coarse — same "dense can only
    # improve" contract as the extraction failure above.
    if (
        not dense.success
        or not dense.is_lineup_throw
        or dense.release_index is None
    ):
        logger.info(
            "throw_localizer: stage=%s coarse_release_ts=%.2f "
            "dense_success=%s dense_is_lineup_throw=%s "
            "dense_release_index=%s; returning coarse: chapter=%r",
            STAGE_DENSE_REJECTED,
            coarse_release_ts,
            dense.success,
            dense.is_lineup_throw,
            dense.release_index,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_DENSE_REJECTED,
            coarse_timing=coarse,
        )

    # Dense pass succeeded — use it. Caller maps the returned indices via
    # dense_timestamps.
    dense_release_ts = dense_timestamps[dense.release_index - 1]
    logger.info(
        "throw_localizer: stage=%s coarse_release_ts=%.2f "
        "dense_release_ts=%.2f shift=%+.2fs coarse_conf=%.2f "
        "dense_conf=%.2f chapter=%r",
        STAGE_REFINED,
        coarse_release_ts,
        dense_release_ts,
        dense_release_ts - coarse_release_ts,
        coarse.confidence or 0.0,
        dense.confidence or 0.0,
        chapter_title,
    )
    return RefinedThrowTiming(
        timing=dense,
        frame_timestamps=dense_timestamps,
        stage=STAGE_REFINED,
        coarse_timing=coarse,
    )
