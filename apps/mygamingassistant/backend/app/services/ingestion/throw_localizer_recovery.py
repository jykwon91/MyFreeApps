"""Throw-localizer pure helpers — sibling of ``throw_localizer``.

Extracted from ``throw_localizer`` so the orchestrator stays under the
file-size growth guard (it was over the 500-LOC threshold and the floor-pin
recovery pass would have pushed it further; growth requires a matching split
per ``apps/mygamingassistant/CLAUDE.md`` "Tech Debt Policy" — ``micro_clip_helpers``
was split from ``micro_clip_generator`` for the same reason).

ONLY pure, side-effect-free helpers live here — the return dataclass, the
stage/constant tables, the window-timestamp math, the gate decision, and the
gap invariant. The I/O-calling passes (coarse / dense / causality recovery /
floor-pin recovery) stay in ``throw_localizer`` so every mockable call
(``extract_frames_downscaled`` / ``classify_throw_timing_from_frames`` /
``dense_window_timestamps``) resolves in that one module's namespace and the
existing test patch sites are unchanged. ``throw_localizer`` re-exports these
names so other import sites (tests, clip_generator, landing_clip_generator,
micro_clip_helpers, diag scripts) are unchanged.
"""
from __future__ import annotations

import dataclasses
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.services.classification.classification_result import ThrowTimingResult
from app.services.classification.throw_timing_classifier import (
    classify_throw_timing_from_frames,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    extract_frames_downscaled,
    grid_timestamps,
)

logger = logging.getLogger(__name__)

# Refine only when the coarse pass cleared the clip-pipeline confidence
# gate. Below this we don't trust the coarse release region enough to
# spend a second Claude call densely sampling around it (and the clip
# would be skipped anyway — see throw_localizer module docstring).
_REFINE_CONFIDENCE_GATE = 0.55

# Dense window shape around the coarse-pass release frame. Spans both the
# pre-release WINDUP (so the model can see the arm wind up and pin the
# separation instant, not drift late into follow-through) and post-release
# coverage (so the dense pass also catches the RESULT frame — typical SMOKE
# result is 1.5-3.0s after release; result_ts feeds the landing clip).
#
# pre=2.0 (operator audit 2026-05-30, lineup 8f92c010 "Catwalk - B Site"): with
# only 1.0s pre-coverage the dense window opened essentially ON the release, so
# the model had no windup frames to anchor against and picked the cleaner-looking
# follow-through ~1.5s late (236.03 vs the real ~234.5). 2.0s puts the windup in
# view so the UTILITY-SEPARATION / ANTI-PRE-WINDUP rules can land the release
# instant. Total window is 5s with N=12 → ~0.45s spacing between candidates.
_DENSE_PRE_RELEASE_SECONDS = 2.0
_DENSE_POST_RELEASE_SECONDS = 3.0
_DENSE_FRAME_COUNT = 12

# Don't bother refining if chapter-boundary clamping leaves the dense
# window with fewer than this many candidates — too few to meaningfully
# tighten the release frame. Coarse is already 12 frames so anything
# under ~4 dense is a regression.
_MIN_DENSE_FRAMES = 4

# ---- Gap invariant (cross-demonstration / hallucinated result) -----------
# A utility's effect appears within ~3s of its release (smoke wisp 1.5-3.0s,
# molotov flame 1.0-2.0s, flash / HE near-instant). A result_index more than
# this far after release_index cannot be THIS throw's result — it is a
# different demonstration's effect, the same smoke viewed after the player
# walked to it, or a hallucinated bloom. 4.5s = the 3s physical max + coarse
# sampler slop (~1.5s). When violated we null result_index so the landing pane
# gates out (release_index, which STAND / AIM / THROW hang off, is untouched).
_MAX_PLAUSIBLE_RESULT_GAP_SECONDS = 4.5

# ---- Causality recovery (multi-demonstration chapters) -------------------
# pre=7.0 covers a fully-bloomed smoke result (release→bloom up to ~3s) plus
# the coarse sampler's own ~3.4s spacing slop; post=1.0 keeps a touch of
# coverage past the event. N=14 over the ~8s window ≈ 0.6s spacing.
_RECOVERY_PRE_RELEASE_SECONDS = 7.0
_RECOVERY_POST_RELEASE_SECONDS = 1.0
_RECOVERY_FRAME_COUNT = 14

# ---- Dense-floor-pin recovery (coarse pick was late) ---------------------
# When the dense pass picks its OWN window floor (release_index == 1) the true
# release is at or before the earliest frame it was shown — the coarse pick
# landed AFTER the real release and the dense window opened too late. Re-search
# a window shifted BACKWARD from the floor.
#
# pre=8.0 (operator audit 2026-05-30, lineup 8f92c010 "Catwalk - B Site"): on a
# MULTI-PERSPECTIVE chapter the coarse pass anchors on a LATER observer / bloom /
# destination view, so the dense window opens several seconds AFTER the real
# thrower-POV throw. Here the genuine release (~234.5, thrower aiming up at the
# tower) sat ~6.5s before the dense floor (241.05) — out of reach of the original
# pre=4.0, which could only reach ~237 and re-pinned on the wrong-POV archway
# frame (~237.8). 8.0 spans back past the whole observer-view run to the thrower's
# own aim-and-release; the THROWER-POV REQUIREMENT in the classifier prompt
# rejects the intervening observer / destination frames so the re-search lands on
# the real throw rather than re-picking one of them. post=1.0 keeps the floor in
# view so a genuinely-at-the-floor release is still selectable. N=14 over the ~9s
# window ≈ 0.7s spacing — fine enough to anchor the release (clip is release ±1s).
_FLOOR_PIN_PRE_SECONDS = 8.0
_FLOOR_PIN_POST_SECONDS = 1.0
_FLOOR_PIN_FRAME_COUNT = 14

# ---- Cross-chapter bleed guard (first-event recovery) --------------------
# A previous lineup's utility effect routinely lingers into the OPENING frames
# of the NEXT chapter's window — a CS2 smoke hangs ~15s, so a lineup thrown
# near a prior chapter's end is still blooming as this chapter starts. The
# coarse pass then reports that lingering effect as an "earlier demonstration
# result" and the first-event recovery anchors on it, pulling release onto the
# chapter boundary BEFORE this chapter's own stand / aim. Operator audit
# 2026-05-30, lineup 7bd971c3 "Market Window": coarse correctly localised the
# real throw at Frame 6 yet flagged Frame 1's bloom — which it itself placed at
# CATWALK, the PRIOR lineup's landmark — as earlier_demo_idx=1 at t=256.50,
# only +0.50s into a chapter starting at 256.0; recovery then re-centred there
# and picked release 256.23, before stand 260.71 / aim 263.30 — incoherent.
#
# Physical invariant: the RESULT of a demonstration that began WITHIN this
# chapter cannot appear in the first few seconds of the chapter — that
# demonstration's own stand → aim → release must precede it, plus the ~1.5-3.0s
# bloom delay. An "earlier result" closer than this to chapter_start is
# therefore a prior lineup's lingering effect, not an in-chapter earlier
# demonstration, and the first-event recovery must NOT anchor on it. The
# genuine multi-demo case clears the zone with huge margin: lineup 69704f4a
# "Market Door"'s real earlier-demonstration result sits at +14.02s.
_CROSS_CHAPTER_BLEED_SECONDS = 3.0

# Diagnostic stage labels — surfaced on RefinedThrowTiming.stage for
# logging / metrics. Keep stable for log-grepping.
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
# Causality-recovery stages (coarse pass was inverted). RECOVERED uses the
# recovery result; REJECTED / *_FAILED / *_TOO_SMALL fall back to coarse.
STAGE_RECOVERED_FIRST_EVENT = "recovered_first_event"
STAGE_RECOVERY_REJECTED = "recovery_rejected"
STAGE_RECOVERY_WINDOW_TOO_SMALL = "recovery_window_too_small"
STAGE_RECOVERY_EXTRACT_FAILED = "recovery_extract_failed"
# Dense-floor-pin recovery stages (dense pass picked its own window floor).
# RECOVERED uses the backward re-search; REJECTED / *_FAILED / *_TOO_SMALL
# fall back to the dense result.
STAGE_RECOVERED_FLOOR_PIN = "recovered_floor_pin"
STAGE_FLOOR_PIN_REJECTED = "floor_pin_rejected"
STAGE_FLOOR_PIN_WINDOW_TOO_SMALL = "floor_pin_window_too_small"
STAGE_FLOOR_PIN_EXTRACT_FAILED = "floor_pin_extract_failed"


@dataclass
class RefinedThrowTiming:
    """Return shape of :func:`throw_localizer.localize_throw_with_refinement`.

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


def is_cross_chapter_bleed(earlier_event_ts: float, chapter_start: float) -> bool:
    """True when an earlier-demonstration event is prior-lineup bleed.

    See the ``_CROSS_CHAPTER_BLEED_SECONDS`` block: an earlier-demonstration
    RESULT within the first few seconds of ``chapter_start`` cannot belong to a
    demonstration that began inside this chapter (no room for its own
    stand → aim → release + the ~1.5-3.0s bloom delay before it), so it is a
    previous lineup's lingering effect. The orchestrator drops the signal so
    the first-event recovery does not re-centre on the chapter boundary.
    """
    return (
        float(earlier_event_ts) - float(chapter_start)
        < _CROSS_CHAPTER_BLEED_SECONDS
    )


def apply_gap_invariant(refined: RefinedThrowTiming) -> RefinedThrowTiming:
    """Null an implausibly-far result_index (cross-demonstration / hallucination).

    HARD physical invariant applied to the FINAL timing the orchestrator is
    about to return, regardless of which pass produced it: a result more than
    ``_MAX_PLAUSIBLE_RESULT_GAP_SECONDS`` after its release cannot be that
    release's own result. The classifier prompt asks for this, but the model
    violates it on multi-demonstration chapters (it confidently pairs one
    demo's release with another's bloom — operator audit 2026-05-29, lineup
    8f92c010 "Catwalk - B Site": coarse paired release ~242 with a bloom ~252,
    a 10s gap, at confidence 0.85). Nulling result_index here gates the landing
    pane out — release_index (which STAND / AIM / THROW hang off) is untouched.

    Returns *refined* unchanged when the gap is plausible or either index is
    None; otherwise a copy whose ``timing`` has ``result_index=None``.
    """
    timing = refined.timing
    if timing.release_index is None or timing.result_index is None:
        return refined
    ts = refined.frame_timestamps
    # Defensive: indices are 1-based into ts; an out-of-range index would
    # IndexError. The classifier validates them, but never trust blindly.
    if not (1 <= timing.release_index <= len(ts)) or not (
        1 <= timing.result_index <= len(ts)
    ):
        return refined
    gap = ts[timing.result_index - 1] - ts[timing.release_index - 1]
    if gap <= _MAX_PLAUSIBLE_RESULT_GAP_SECONDS:
        return refined
    logger.info(
        "throw_localizer: gap invariant nulled result_index: stage=%s gap=%.2fs "
        "(> %.1fs) release_idx=%s result_idx=%s — landing pane gates out",
        refined.stage, gap, _MAX_PLAUSIBLE_RESULT_GAP_SECONDS,
        timing.release_index, timing.result_index,
    )
    gated = dataclasses.replace(timing, result_index=None)
    return dataclasses.replace(refined, timing=gated)


async def attempt_floor_pin_recovery(
    video_path: Path,
    dense: ThrowTimingResult,
    dense_timestamps: list[float],
    coarse: ThrowTimingResult,
    *,
    chapter_start: float,
    chapter_end: float,
    chapter_title: Optional[str],
    utility_hint: Optional[str],
) -> RefinedThrowTiming:
    """Re-localise EARLIER after the dense pass pinned its own window floor.

    Precondition (checked by the caller): the dense pass returned a clean,
    throw-positive result with ``release_index == 1`` — it selected the
    earliest frame of its window, i.e. the true release is at or before the
    dense window's floor. The coarse pick landed AFTER the real release and the
    dense window opened too late. Re-search a window shifted BACKWARD from the
    floor and re-run the classifier.

    Lives in this sibling module (not ``throw_localizer``) so the orchestrator
    stays under the file-size growth guard — the new recovery pass would push it
    over (see ``apps/mygamingassistant/CLAUDE.md`` "Tech Debt Policy"). Because
    it now calls ``extract_frames_downscaled`` / ``classify_throw_timing_from_frames``
    / ``dense_window_timestamps`` resolved in THIS module's namespace, its tests
    patch ``...throw_localizer_recovery.*`` (the orchestrator's coarse/dense
    passes still patch ``...throw_localizer.*``). The causality recovery stays
    in ``throw_localizer`` — moving shipped, tested code risks regressing Market
    Door; only the new floor-pin pass moves here.

    Always returns a RefinedThrowTiming:
      * ``STAGE_RECOVERED_FLOOR_PIN`` — the backward re-search produced a clean,
        throw-positive result whose release is NOT pinned to the new window's
        floor (``release_index > 1``) — meaning we bracketed the actual release
        rather than pinning again. ``timing`` is the re-search result and
        ``frame_timestamps`` is the backward window.
      * ``STAGE_FLOOR_PIN_*`` — the re-search could not improve; ``timing`` is
        the dense result and ``frame_timestamps`` is the dense window. A re-pin
        counts as no improvement (the release is earlier than this chapter can
        sample cleanly — the dense floor stays the best available anchor rather
        than chasing an even-earlier guess that may cross a prior demonstration).
    """
    floor_ts = dense_timestamps[0]
    backward_timestamps = dense_window_timestamps(
        floor_ts,
        chapter_start,
        chapter_end,
        pre_release_seconds=_FLOOR_PIN_PRE_SECONDS,
        post_release_seconds=_FLOOR_PIN_POST_SECONDS,
        n=_FLOOR_PIN_FRAME_COUNT,
    )

    if len(backward_timestamps) < _MIN_DENSE_FRAMES:
        logger.info(
            "throw_localizer: stage=%s floor_ts=%.2f backward_n=%d (< %d); "
            "returning dense: chapter=%r",
            STAGE_FLOOR_PIN_WINDOW_TOO_SMALL,
            floor_ts,
            len(backward_timestamps),
            _MIN_DENSE_FRAMES,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=dense,
            frame_timestamps=dense_timestamps,
            stage=STAGE_FLOOR_PIN_WINDOW_TOO_SMALL,
            coarse_timing=coarse,
        )

    try:
        backward_frames = await extract_frames_downscaled(
            video_path, backward_timestamps
        )
    except FrameExtractionError as exc:
        logger.warning(
            "throw_localizer: stage=%s floor_ts=%.2f returncode=%s stderr=%s; "
            "returning dense: chapter=%r",
            STAGE_FLOOR_PIN_EXTRACT_FAILED,
            floor_ts,
            exc.returncode,
            exc.stderr[:200],
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=dense,
            frame_timestamps=dense_timestamps,
            stage=STAGE_FLOOR_PIN_EXTRACT_FAILED,
            coarse_timing=coarse,
        )

    rescanned = await classify_throw_timing_from_frames(
        frames=backward_frames,
        frame_timestamps=backward_timestamps,
        chapter_title=chapter_title,
        chapter_duration=float(chapter_end) - float(chapter_start),
        utility_hint=utility_hint,
    )

    # Accept only a clean, throw-positive re-search whose release is bracketed
    # by the new window (release_index > 1). A re-pin (release_index == 1 again)
    # means the true release is still earlier than we can sample — the dense
    # floor stays the best available anchor; do not regress to an even-earlier
    # guess that may have crossed into a prior demonstration.
    if (
        not rescanned.success
        or not rescanned.is_lineup_throw
        or rescanned.release_index is None
        or rescanned.release_index == 1
        or rescanned.causality_inverted_earlier_index is not None
    ):
        logger.info(
            "throw_localizer: stage=%s floor_ts=%.2f rescanned_success=%s "
            "rescanned_is_lineup_throw=%s rescanned_release_index=%s; "
            "returning dense: chapter=%r",
            STAGE_FLOOR_PIN_REJECTED,
            floor_ts,
            rescanned.success,
            rescanned.is_lineup_throw,
            rescanned.release_index,
            chapter_title,
        )
        return RefinedThrowTiming(
            timing=dense,
            frame_timestamps=dense_timestamps,
            stage=STAGE_FLOOR_PIN_REJECTED,
            coarse_timing=coarse,
        )

    rescanned_release_ts = backward_timestamps[rescanned.release_index - 1]
    logger.info(
        "throw_localizer: stage=%s floor_ts=%.2f rescanned_release_ts=%.2f "
        "shift=%+.2fs chapter=%r",
        STAGE_RECOVERED_FLOOR_PIN,
        floor_ts,
        rescanned_release_ts,
        rescanned_release_ts - floor_ts,
        chapter_title,
    )
    return RefinedThrowTiming(
        timing=rescanned,
        frame_timestamps=backward_timestamps,
        stage=STAGE_RECOVERED_FLOOR_PIN,
        coarse_timing=coarse,
    )
