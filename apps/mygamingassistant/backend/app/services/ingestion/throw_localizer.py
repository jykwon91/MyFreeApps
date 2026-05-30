"""Throw localizer — two-stage release-frame refinement (orchestrator).

The clip pipeline's coarse pass samples N=12 frames over a 30-180s chapter
window, putting frames roughly 2-15 seconds apart. Even a perfect classifier
prompt cannot pick a frame the sampler never extracted — so the final clip
anchor is at best "release ± 1.5s" on a typical chapter. That cadence is the
underlying defect; PR #749 / #750 only chip at its symptoms.

This module orchestrates the throw-timing classifier across one coarse pass and
up to one refinement / recovery pass. The pure leaf helpers (the return
dataclass, the stage/constant tables, the window-timestamp math, the gate
decision, and the gap invariant) live in the sibling ``throw_localizer_recovery``
module (split out so this orchestrator stays under the file-size growth guard —
see ``apps/mygamingassistant/CLAUDE.md`` "Tech Debt Policy"); they are
re-exported below so existing import sites are unchanged. The I/O-calling passes
stay HERE so their ``extract_frames_downscaled`` / ``classify_*`` /
``dense_window_timestamps`` lookups all resolve in this one namespace.

  Stage 1 — coarse pass:
    ``clip_window_timestamps`` → ``extract_frames_downscaled`` →
    ``classify_throw_timing_from_frames`` returns a coarse release/result.

  Stage 2 — dense pass (only when Stage 1 cleared its 0.55 gate):
    ``dense_window_timestamps`` builds 8 frames at ~0.5s spacing around the
    coarse release; a second classify call returns a frame-accurate release.

  Recovery passes, each fired on a specific failure signature and each owning
  the "can only improve, never regress" contract:
    * Causality recovery — coarse paired a LATE demo's release with an EARLY
      demo's result (``result_index < release_index``). Re-localise around the
      first event. (#780 / lineup 69704f4a "Market Door".)
    * Dense-floor-pin recovery — the dense pass selected its own window floor
      (``release_index == 1``): the true release is earlier than the window
      opened. Re-search a backward-shifted window. (Lineup 8f92c010
      "Catwalk - B Site": coarse late → dense floored at the smoke-in-flight
      frame; the real aim-up-at-tower release is ~3s earlier.)

  Gap invariant (``apply_gap_invariant``, applied to every returned result): a
  result more than ~4.5s after its release cannot be that release's own result
  (a smoke blooms within ~3s). On a multi-demonstration chapter the classifier
  confidently pairs one demo's release with another's bloom; the orchestration
  nulls the offending ``result_index`` so the landing pane gates out, leaving
  release_index (STAND / AIM / THROW) untouched.

Failure handling (per rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): the dense / recovery passes can ONLY
improve the result; any failure falls through to the prior result so the clip
pipeline never regresses. The diagnostic ``stage`` field carries which path was
taken. A coarse-pass extraction failure re-raises so the caller surfaces its
structured codes.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from app.services.classification.classification_result import ThrowTimingResult
from app.services.classification.throw_timing_classifier import (
    classify_throw_timing_from_frames,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    clip_window_timestamps,
    extract_frames_downscaled,
)

# Pure helpers from the sibling, re-exported into THIS namespace so:
#   (1) existing import sites (tests / clip_generator / landing_clip_generator /
#       micro_clip_helpers / diag scripts) keep importing from ``throw_localizer``;
#   (2) the recovery passes below call ``dense_window_timestamps`` via this
#       module's namespace, so a test ``patch("...throw_localizer.dense_window_timestamps")``
#       affects the dense pass AND the recovery passes uniformly.
from app.services.ingestion.throw_localizer_recovery import (  # noqa: F401
    STAGE_COARSE_BELOW_GATE,
    STAGE_COARSE_FAILED,
    STAGE_COARSE_NO_RELEASE,
    STAGE_COARSE_NOT_A_THROW,
    STAGE_COARSE_ONLY,
    STAGE_DENSE_CLASSIFIER_FAILED,
    STAGE_DENSE_EXTRACT_FAILED,
    STAGE_DENSE_REJECTED,
    STAGE_DENSE_WINDOW_TOO_SMALL,
    STAGE_FLOOR_PIN_EXTRACT_FAILED,
    STAGE_FLOOR_PIN_REJECTED,
    STAGE_FLOOR_PIN_WINDOW_TOO_SMALL,
    STAGE_RECOVERED_FIRST_EVENT,
    STAGE_RECOVERED_FLOOR_PIN,
    STAGE_RECOVERY_EXTRACT_FAILED,
    STAGE_RECOVERY_REJECTED,
    STAGE_RECOVERY_WINDOW_TOO_SMALL,
    STAGE_REFINED,
    RefinedThrowTiming,
    _CROSS_CHAPTER_BLEED_SECONDS,
    _MIN_DENSE_FRAMES,
    _RECOVERY_FRAME_COUNT,
    _RECOVERY_POST_RELEASE_SECONDS,
    _RECOVERY_PRE_RELEASE_SECONDS,
    _should_refine,
    apply_gap_invariant,
    attempt_floor_pin_recovery,
    dense_window_timestamps,
    is_cross_chapter_bleed,
)

logger = logging.getLogger(__name__)


async def _attempt_first_event_recovery(
    video_path: Path,
    coarse: ThrowTimingResult,
    coarse_timestamps: list[float],
    *,
    earlier_index: int,
    chapter_start: float,
    chapter_end: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str],
) -> RefinedThrowTiming:
    """Re-localise around the FIRST event of a multi-demonstration chapter.

    Precondition (resolved by the caller): ``coarse`` is a successful,
    throw-positive result for which an EARLIER demonstration's event was
    flagged — either by a causality inversion (``result_index <
    release_index`` → ``causality_inverted_earlier_index``) or by the general
    multi-demonstration signal (``earlier_demonstration_result_index``). Both
    point at an earlier demonstration's RESULT, so the true first release
    precedes it; the caller passes that 1-based index as ``earlier_index``. We
    sample a backward-weighted dense window around that event and re-run the
    throw-timing classifier on the (now single-throw) window.

    Always returns a RefinedThrowTiming so the caller can return it directly:
      * ``STAGE_RECOVERED_FIRST_EVENT`` — clean, non-re-inverted, throw-positive
        result with a release; ``timing`` is the recovery result and
        ``frame_timestamps`` is the recovery window.
      * ``STAGE_RECOVERY_*`` — recovery could not improve on coarse; ``timing``
        is the coarse result and ``frame_timestamps`` is the coarse window.
        Same "never regress" contract as the dense pass.
    """
    if not (1 <= earlier_index <= len(coarse_timestamps)):
        # Defensive: the caller resolved this from a model-reported index, but
        # a stale/out-of-range value must not index-error — fall back to coarse.
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_RECOVERY_REJECTED,
            coarse_timing=coarse,
        )

    earlier_event_ts = coarse_timestamps[earlier_index - 1]
    recovery_timestamps = dense_window_timestamps(
        earlier_event_ts,
        chapter_start,
        chapter_end,
        pre_release_seconds=_RECOVERY_PRE_RELEASE_SECONDS,
        post_release_seconds=_RECOVERY_POST_RELEASE_SECONDS,
        n=_RECOVERY_FRAME_COUNT,
    )

    if len(recovery_timestamps) < _MIN_DENSE_FRAMES:
        logger.info(
            "throw_localizer: stage=%s earlier_event_ts=%.2f recovery_n=%d "
            "(< %d); returning coarse: chapter=%r",
            STAGE_RECOVERY_WINDOW_TOO_SMALL,
            earlier_event_ts,
            len(recovery_timestamps),
            _MIN_DENSE_FRAMES,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_RECOVERY_WINDOW_TOO_SMALL,
            coarse_timing=coarse,
        )

    try:
        recovery_frames = await extract_frames_downscaled(
            video_path, recovery_timestamps
        )
    except FrameExtractionError as exc:
        # A recovery-pass extraction failure must NEVER regress the pipeline —
        # fall back to coarse (same contract as the dense pass).
        logger.warning(
            "throw_localizer: stage=%s earlier_event_ts=%.2f returncode=%s "
            "stderr=%s; returning coarse: chapter=%r",
            STAGE_RECOVERY_EXTRACT_FAILED,
            earlier_event_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_RECOVERY_EXTRACT_FAILED,
            coarse_timing=coarse,
        )

    recovered = await classify_throw_timing_from_frames(
        frames=recovery_frames,
        frame_timestamps=recovery_timestamps,
        chapter_title=chapter_title,
        chapter_duration=float(chapter_end) - float(chapter_start),
        utility_hint=utility_hint,
    )

    # Accept only a clean, throw-positive recovery with a release that did NOT
    # itself invert — a re-inverted recovery means the window still spans more
    # than one demonstration, so it is no more trustworthy than coarse.
    if (
        not recovered.success
        or not recovered.is_lineup_throw
        or recovered.release_index is None
        or recovered.causality_inverted_earlier_index is not None
        or recovered.earlier_demonstration_result_index is not None
    ):
        logger.info(
            "throw_localizer: stage=%s earlier_event_ts=%.2f "
            "recovered_success=%s recovered_is_lineup_throw=%s "
            "recovered_release_index=%s recovered_reinverted=%s "
            "recovered_still_multidemo=%s; returning coarse: chapter=%r",
            STAGE_RECOVERY_REJECTED,
            earlier_event_ts,
            recovered.success,
            recovered.is_lineup_throw,
            recovered.release_index,
            recovered.causality_inverted_earlier_index is not None,
            recovered.earlier_demonstration_result_index is not None,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=coarse,
            frame_timestamps=coarse_timestamps,
            stage=STAGE_RECOVERY_REJECTED,
            coarse_timing=coarse,
        )

    recovered_release_ts = recovery_timestamps[recovered.release_index - 1]
    logger.info(
        "throw_localizer: stage=%s earlier_event_ts=%.2f "
        "recovered_release_ts=%.2f coarse_conf=%.2f recovered_conf=%.2f "
        "chapter=%r",
        STAGE_RECOVERED_FIRST_EVENT,
        earlier_event_ts,
        recovered_release_ts,
        coarse.confidence or 0.0,
        recovered.confidence or 0.0,
        chapter_title,
    )
    return RefinedThrowTiming(
        timing=recovered,
        frame_timestamps=recovery_timestamps,
        stage=STAGE_RECOVERED_FIRST_EVENT,
        coarse_timing=coarse,
    )


async def localize_throw_with_refinement(
    video_path: Path,
    *,
    chapter_start: float,
    chapter_end: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str] = None,
) -> RefinedThrowTiming:
    """Localise the throw with optional dense-pass refinement + recovery.

    See module docstring for the full decision tree. Always returns a
    RefinedThrowTiming — the dense result when refinement succeeded, a recovery
    result when a recovery pass improved, otherwise the coarse result. Every
    return path runs through :func:`apply_gap_invariant`, which nulls a
    result_index implausibly far from release_index (cross-demonstration /
    hallucinated bloom) so the landing pane gates out rather than anchoring on
    a wrong frame.

    Args:
        video_path: Local source video file. Caller owns its lifecycle.
        chapter_start / chapter_end: Source chapter bounds in seconds.
        chapter_title: Per-call context surfaced to Claude.
        utility_hint: Optional utility slug from a prior grid classification.
    """
    chapter_duration = float(chapter_end) - float(chapter_start)

    # ---- Stage 1: coarse pass -------------------------------------------
    coarse_timestamps = clip_window_timestamps(chapter_start, chapter_end)

    try:
        coarse_frames = await extract_frames_downscaled(
            video_path, coarse_timestamps
        )
    except FrameExtractionError as exc:
        # The caller (clip_generator / landing_clip_generator) owns the
        # downscale-extract failure surface — re-raise so it can surface
        # structured codes.
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

    # ---- First-event recovery (multi-demonstration chapters) ------------
    # The coarse pass localised a LATER demonstration's release when an EARLIER
    # one exists. Two signals flag this, and either fires the same recovery:
    #   * causality inversion — the model paired a late demo's release with an
    #     early demo's result (result_index < release_index).
    #   * multi-demonstration report — earlier_demonstration_result_index, set
    #     even WITHOUT an inversion (lineup 69704f4a "Market Door": the 2nd
    #     demo's release was confidently localised at ~317 with a consistent
    #     later result, so no inversion fired, while the real 1st throw sat at
    #     ~298 — STAND/AIM/LANDING anchored there but the throw clip didn't).
    # Re-localise around the earlier event. This path OWNS the outcome and never
    # falls through to the refine pass (which would centre on the WRONG late
    # release). Prefer the inversion index when both are set — it is the
    # tighter, already-shipped signal.
    earlier_index = (
        coarse.causality_inverted_earlier_index
        if coarse.causality_inverted_earlier_index is not None
        else coarse.earlier_demonstration_result_index
    )
    # ---- Cross-chapter bleed guard --------------------------------------
    # An "earlier demonstration" the coarse pass located in the opening seconds
    # of the chapter window is a PRIOR lineup's lingering effect (its smoke
    # still in the air as this chapter opened), not an earlier repeat of THIS
    # lineup. Drop the signal so the first-event recovery does not re-centre on
    # the chapter boundary; normal refinement then localises this chapter's own
    # throw. See throw_localizer_recovery.is_cross_chapter_bleed (operator audit
    # 2026-05-30, lineup 7bd971c3 "Market Window" — recovery had pulled release
    # to 256.23, before the chapter's own stand 260.71 / aim 263.30).
    if (
        earlier_index is not None
        and 1 <= earlier_index <= len(coarse_timestamps)
        and is_cross_chapter_bleed(
            coarse_timestamps[earlier_index - 1], chapter_start
        )
    ):
        logger.info(
            "throw_localizer: cross-chapter bleed — dropping earlier-demo "
            "signal at t=%.2f (off=%+.2fs from chapter_start %.2f) so recovery "
            "does not anchor on a prior lineup's lingering effect; chapter=%r",
            coarse_timestamps[earlier_index - 1],
            coarse_timestamps[earlier_index - 1] - float(chapter_start),
            float(chapter_start),
            chapter_title,
        )
        earlier_index = None
    if coarse.success and coarse.is_lineup_throw and earlier_index is not None:
        return apply_gap_invariant(
            await _attempt_first_event_recovery(
                video_path,
                coarse,
                coarse_timestamps,
                earlier_index=earlier_index,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                chapter_title=chapter_title,
                utility_hint=utility_hint,
            )
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
        return apply_gap_invariant(
            RefinedThrowTiming(
                timing=coarse,
                frame_timestamps=coarse_timestamps,
                stage=skip_stage,
                coarse_timing=coarse,
            )
        )

    # ---- Stage 2: dense refinement --------------------------------------
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
        return apply_gap_invariant(
            RefinedThrowTiming(
                timing=coarse,
                frame_timestamps=coarse_timestamps,
                stage=STAGE_DENSE_WINDOW_TOO_SMALL,
                coarse_timing=coarse,
            )
        )

    try:
        dense_frames = await extract_frames_downscaled(
            video_path, dense_timestamps
        )
    except FrameExtractionError as exc:
        # A dense-pass extraction failure must NEVER regress the pipeline:
        # the coarse result already cleared the clip gates.
        logger.warning(
            "throw_localizer: stage=%s coarse_release_ts=%.2f "
            "returncode=%s stderr=%s; returning coarse: chapter=%r",
            STAGE_DENSE_EXTRACT_FAILED,
            coarse_release_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return apply_gap_invariant(
            RefinedThrowTiming(
                timing=coarse,
                frame_timestamps=coarse_timestamps,
                stage=STAGE_DENSE_EXTRACT_FAILED,
                coarse_timing=coarse,
            )
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
        return apply_gap_invariant(
            RefinedThrowTiming(
                timing=coarse,
                frame_timestamps=coarse_timestamps,
                stage=STAGE_DENSE_REJECTED,
                coarse_timing=coarse,
            )
        )

    # ---- Dense-floor-pin recovery ---------------------------------------
    # The dense pass selected its OWN window floor (release_index == 1): the
    # true release is at or before the earliest frame it was shown — the coarse
    # pick was late and the dense window opened past the actual release.
    # Re-search a backward-shifted window. The recovery owns the outcome (a
    # re-search failure / re-pin returns the dense result tagged with a
    # floor-pin stage — never a regression).
    if dense.release_index == 1:
        return apply_gap_invariant(
            await attempt_floor_pin_recovery(
                video_path,
                dense,
                dense_timestamps,
                coarse,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                chapter_title=chapter_title,
                utility_hint=utility_hint,
            )
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
    return apply_gap_invariant(
        RefinedThrowTiming(
            timing=dense,
            frame_timestamps=dense_timestamps,
            stage=STAGE_REFINED,
            coarse_timing=coarse,
        )
    )
