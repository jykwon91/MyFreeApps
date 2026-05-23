"""Stand + Aim micro-clip generator — 1s looped clips for the STAND and AIM
panes of the 2×2 storyboard tile (PR6).

PR4 introduced the four-pane storyboard (STAND still | AIM still+anchor | THROW
clip | LANDING text). PR5 replaced the LANDING text with a real landing clip.
PR6 replaces the STAND and AIM stills with **1-second looping micro-clips**.

**Anchor sources differ per side** (operator-tuned 2026-05-23 after AIM was
shown to be random):

  - **STAND** anchors on the grid classifier's chosen ``stand`` frame
    (``timestamps[stand_idx]``). The 9-frame grid samples evenly across the
    chapter — coarse, but the STAND moment ("I am at the spot") is many seconds
    long, so the grid reliably catches it.

  - **AIM** anchors on **release_ts − _AIM_PRE_RELEASE_SECONDS** (0.8s before
    the throw-localizer's release frame). The aim moment ("crosshair locked on
    the alignment marker, immediately before release") is sub-second; the
    9-frame grid is far too sparse to catch it reliably (~2-3s spacing on a
    typical chapter), so Claude was picking a random distant frame for AIM.
    The throw-timing classifier's dense pass (0.5s spacing around release)
    already sees the locked-aim moment — its first 2 seconds before
    release_ts IS the aim moment. So AIM derives off release_ts, not the
    grid. The 1.0s AIM clip spans [release − 0.8s, release + 0.2s] — locked-
    aim plus the first 0.2s of throw initiation.

Two entry paths share one contract:

  1. **Ingest path** — orchestrator already ran the grid classifier (for
     ``stand_idx``) AND the throw-localizer (for ``release_ts``). It passes
     ``precomputed_stand_ts`` (= ``timestamps[stand_idx]``) and
     ``precomputed_release_ts`` (= the dense-pass release frame timestamp).
     Generator skips both classifier calls entirely. Cost: zero extra Claude
     spend; two ffmpeg cuts + two MinIO uploads per chapter.

  2. **Backfill path** — standalone CLI. Both precomputed values are None;
     generator runs the grid classifier itself to recover ``stand_ts`` AND
     calls ``localize_throw_with_refinement`` to recover ``release_ts``.
     Cost: 1 grid call + 1-2 throw-timing calls per lineup. The two sides
     remain independent: a stand-side failure NEVER rolls back the
     already-committed aim clip, and vice versa.

The AIM still + the persisted ``aim_anchor_x/y`` overlay coords are NOT
recut here — they continue to derive from the grid classifier's aim frame.
This is intentional Phase-1 scope: the AIM clip (what the operator actually
sees in the default clip-mode view) is fixed; the brief poster flash and
the rarely-used still-mode fallback are accepted-imperfections, listed in
TECH_DEBT.md for a follow-up that re-extracts a single PNG at AIM_TS too.
See ``project_mga_aim_anchor_center_screen_invariant.md`` in auto-memory.

Cut + encode the muted MP4 via :func:`cut_clip` (re-uses the PR2 ffmpeg
wrapper — same encode contract, same ``+faststart``), upload to MinIO under
a deterministic key, persist the bare key via the matching repo setter.

Idempotent: keys are ``pending/{video_id}/{int(chapter_start)}-stand-micro.mp4``
and ``pending/{video_id}/{int(chapter_start)}-aim-micro.mp4``. Re-running
overwrites the same objects instead of orphaning new ones. The DB writes are
**two separate one-column commits** (``set_stand_clip_url`` +
``set_aim_clip_url``) so a stand-side failure NEVER rolls back the already-
committed aim clip, and vice versa. Mirrors PR2 / PR5 exactly.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): yt-dlp / ffmpeg / Claude failures
are captured with structured codes, logged at WARNING, and returned in
``stand_error_codes`` / ``aim_error_codes``. ``*_clip_url`` is left NULL and
the matching pane renders its still fallback. Nothing silent-fails.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.classification.classifier_service import (
    classify_frames_for_lineup_decision,
)
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
    cut_clip,
    extract_frames,
    grid_timestamps,
    wide_source_bounds,
)
from app.services.ingestion.throw_localizer import (
    localize_throw_with_refinement,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)

# Frozen design-contract constants.
# Per-pane micro-clip durations. STAND is 2.0s (operator-tuned: 1.0s was
# cutting off mid-stance, before the player begins the throw motion). AIM
# stays at 1.0s — the AIM pane's whole point is the locked-aim moment;
# longer would bleed deeper into the throw animation (which is what the
# THROW pane already shows).
_STAND_MICRO_CLIP_SECONDS = 2.0
_AIM_MICRO_CLIP_SECONDS = 1.0
# Seconds BEFORE release_ts the AIM clip starts at. Result: the 1.0s AIM
# clip spans [release − 0.8s, release + 0.2s] — locked-aim moment with a
# tiny peek of throw initiation as a natural end-cue. Smaller would risk
# dropping the lock-on frame on edge cases (slight release-frame error
# from the dense pass); larger would step on the THROW pane's window.
_AIM_PRE_RELEASE_SECONDS = 0.8
# Minimum acceptable clamped duration. A near-end timestamp may clip short;
# under this threshold we skip rather than ship a useless ~200ms sliver.
_MIN_CLIP_SECONDS = 0.5
# Grid sample count + edge padding — must match the ingest orchestrator's
# ingestion_orchestrator._GRID_FRAME_COUNT / _GRID_EDGE_PADDING_SECONDS so
# the backfill recovers the SAME timestamps the ingest pass extracted.
_GRID_FRAME_COUNT = 9
_GRID_EDGE_PADDING_SECONDS = 1.0


@dataclass
class MicroClipGenerationResult:
    """Structured outcome of a stand+aim micro-clip-generation attempt.

    Two independent halves (stand / aim) — each can be ``"generated"``,
    ``"skipped"`` (deliberate non-error), or ``"failed"`` (operational fault
    with structured ``error_codes``). The orchestrator / backfill route on
    these to count outcomes without re-parsing log lines.

    ``status`` values per side:
      - ``"generated"`` — clip cut, uploaded, ``*_clip_url`` committed.
      - ``"skipped"``   — deliberately no clip (no source video / chapter too
        short / classifier disabled or unavailable on the backfill path).
        NOT an error; the matching pane gracefully falls back to its still.
      - ``"failed"``    — operational failure (download / extract / cut /
        upload / persist / Claude API). ``*_error_codes`` carries the
        structured reason; ``*_clip_url`` left NULL; a later backfill retries.
    """

    stand_status: str
    aim_status: str
    stand_clip_key: Optional[str] = None
    aim_clip_key: Optional[str] = None
    stand_skip_reason: Optional[str] = None
    aim_skip_reason: Optional[str] = None
    stand_error_codes: list[str] = field(default_factory=list)
    aim_error_codes: list[str] = field(default_factory=list)
    stand_ts: Optional[float] = None
    aim_ts: Optional[float] = None
    reasoning: str = ""

    @property
    def any_generated(self) -> bool:
        return self.stand_status == "generated" or self.aim_status == "generated"

    @property
    def any_failed(self) -> bool:
        return self.stand_status == "failed" or self.aim_status == "failed"


def pending_stand_clip_key(video_id: str, chapter_start_seconds: float) -> str:
    """Deterministic MinIO key for a lineup's STAND micro-clip.

    Parallel to PR2's :func:`clip_generator.pending_clip_key` and PR5's
    :func:`landing_clip_generator.pending_landing_clip_key` — same shape,
    different suffix. One key per (video, chapter start) makes the backfill
    idempotent: re-running overwrites the same object instead of orphaning
    a new one.
    """
    return f"pending/{video_id}/{int(chapter_start_seconds)}-stand-micro.mp4"


def pending_aim_clip_key(video_id: str, chapter_start_seconds: float) -> str:
    """Deterministic MinIO key for a lineup's AIM micro-clip."""
    return f"pending/{video_id}/{int(chapter_start_seconds)}-aim-micro.mp4"


def _compute_micro_bounds(
    anchor_ts: float,
    chapter_start: float,
    chapter_end: float,
    clip_seconds: float,
) -> Optional[tuple[float, float]]:
    """Return ``(clip_start, clip_duration)`` seconds, or None if too short.

    Starts AT the anchor timestamp (the classifier-chosen frame), runs
    forward for ``clip_seconds``, clamped to the chapter end. The
    important property is that ``clip_start == anchor_ts`` exactly — that
    is what keeps the AIM clip's first frame identical to the existing aim
    still, so the persisted ``aim_anchor_x/y`` overlay stays pixel-accurate.

    ``clip_seconds`` is supplied by the caller per-pane (STAND uses
    ``_STAND_MICRO_CLIP_SECONDS``, AIM uses ``_AIM_MICRO_CLIP_SECONDS``).
    Explicit at the call site rather than a default — the two panes have
    deliberately different durations and silently sharing one default
    would obscure the asymmetry.

    Returns None when the clamped duration is shorter than
    ``_MIN_CLIP_SECONDS`` (the anchor is too close to the chapter end to
    carry a meaningful clip). Caller skips with reason
    ``chapter_too_short_for_microclip``.
    """
    start = max(float(anchor_ts), float(chapter_start))
    end = min(start + float(clip_seconds), float(chapter_end))
    duration = end - start
    if duration < _MIN_CLIP_SECONDS:
        return None
    return start, duration


def _micro_clip_seconds_for_side(side: str) -> float:
    """Resolve the per-pane micro-clip duration. Centralized so both ingest
    and backfill paths get the same answer for the same side string."""
    if side == "stand":
        return _STAND_MICRO_CLIP_SECONDS
    if side == "aim":
        return _AIM_MICRO_CLIP_SECONDS
    raise ValueError(f"unknown micro-clip side: {side!r}")


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
    derived from release_ts (see module docstring); the grid pass is too
    sparse to localise the sub-second aim moment. STAND is unaffected
    because the standing-at-spot window is many seconds long and the
    9-frame grid reliably catches it.
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
            "micro_clip_generator: grid frame extraction failed: "
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
            "micro_clip_generator: grid classifier raised: lineup=%s error=%s",
            lineup.id, str(exc),
        )
        return None, [f"classifier_raised:{type(exc).__name__}"], str(exc)

    if not result.success:
        logger.warning(
            "micro_clip_generator: grid classifier call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, result.error_codes,
        )
        return None, list(result.error_codes), "grid classifier reported failure"

    if not result.is_lineup:
        # The backfill candidate is an accepted lineup, so the classifier
        # judging it "not a lineup" here would be a regression — keep the
        # signal but skip cleanly rather than fabricate a timestamp.
        return None, [], "backfill grid says not_a_lineup (skip)"

    # 1-based → 0-based, clamped to the grid range. Falls back to first
    # index when the model omitted it — same shape as the orchestrator's
    # classifier-disabled fallback.
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
    ``release_ts - _AIM_PRE_RELEASE_SECONDS`` (see module docstring on why
    AIM derives from release, not the grid). When the localizer judges the
    chapter not-a-throw or returns no release frame, we surface that as an
    empty error_codes + structured reasoning (skip cleanly, not fail) — the
    AIM clip is best-effort and a non-throw lineup is a real signal, not an
    operational fault.
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
        # Coarse frame-extract failure propagates per throw_localizer's
        # contract — capture as a structured code so the side-tally surfaces
        # it instead of crashing.
        logger.warning(
            "micro_clip_generator: throw localizer extract failed: "
            "lineup=%s returncode=%s stderr=%s",
            lineup.id, exc.returncode, exc.stderr[:300],
        )
        return None, [f"throw_localizer_extract:rc={exc.returncode}"], str(exc)
    except Exception as exc:  # defensive
        logger.warning(
            "micro_clip_generator: throw localizer raised: lineup=%s error=%s",
            lineup.id, str(exc),
        )
        return None, [f"throw_localizer_raised:{type(exc).__name__}"], str(exc)

    timing = refined.timing
    if not timing.success:
        logger.warning(
            "micro_clip_generator: throw localizer call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, timing.error_codes,
        )
        return None, list(timing.error_codes), "throw localizer reported failure"

    if not timing.is_lineup_throw or timing.release_index is None:
        # Not a throw OR no usable release frame — clean skip, not a fault.
        return None, [], "throw localizer found no usable release frame"

    release_ts = refined.frame_timestamps[timing.release_index - 1]
    return release_ts, [], timing.reasoning or ""


async def generate_micro_clips_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    chapter_start: float,
    chapter_end: float,
    video_path: Optional[Path] = None,
    download_dir: Optional[Path] = None,
    precomputed_stand_ts: Optional[float] = None,
    precomputed_release_ts: Optional[float] = None,
) -> MicroClipGenerationResult:
    """Cut + persist STAND and AIM micro-clips for *lineup*.

    AIM anchors on ``release_ts - _AIM_PRE_RELEASE_SECONDS`` (NOT on the
    grid classifier's aim_idx — that pass is too sparse for the sub-second
    aim moment; see module docstring). STAND still anchors on the grid's
    stand_idx.

    Two entry paths:

    **Ingest path** — caller (orchestrator) passes ``precomputed_stand_ts``
    (from the grid run it already did) AND ``precomputed_release_ts`` (from
    the throw-localizer run it already did for the THROW clip). The
    generator skips both Claude calls entirely. Cost: zero extra Claude
    spend; two extra ffmpeg cuts + two MinIO uploads per chapter.

    Partial-ingest case: if the orchestrator's THROW clip step skipped or
    failed, ``precomputed_release_ts`` is None and the AIM side is skipped
    with reason ``no_release_ts_for_aim`` — STAND still generates from the
    precomputed grid stand_ts.

    **Backfill path** — caller is the CLI; both precomputed values are
    None. We re-run the grid classifier (for stand_ts) AND the
    throw-localizer (for release_ts → AIM_TS). Cost: 1 grid call + 1-2
    throw-timing calls per lineup. Stand- and aim-side failures are tallied
    independently.

    Per-side independence: a stand-side failure NEVER rolls back the
    already-committed aim side, and vice versa. Each side has its own
    status / error_codes in the returned result.

    Args:
        db: Active async session. On success each clip's bare key is
            committed via ``lineup_repo.set_stand_clip_url`` /
            ``set_aim_clip_url`` (each its own one-column commit per
            PR #687/#695).
        lineup: The row to clip. ``youtube_video_id`` must be set.
        chapter_start / chapter_end: Source chapter bounds in seconds.
        video_path: Already-downloaded source video to reuse (ingest /
            backfill that batches per video). When None the video is
            re-fetched into *download_dir* and deleted afterwards.
        download_dir: Required when *video_path* is None.
        precomputed_stand_ts: Ingest path — ``timestamps[stand_idx]`` from
            the grid classifier output the orchestrator already has.
            Backfill path — None; generator re-runs the grid classifier.
        precomputed_release_ts: Ingest path — the throw-localizer's release
            frame timestamp (from clip_generator's returned ClipGenerationResult).
            None when the orchestrator's THROW clip step skipped/failed
            (AIM is then skipped too). Backfill path — None; generator
            runs the throw-localizer itself.

    Returns:
        MicroClipGenerationResult — never raises for expected failures.
    """
    video_id = lineup.youtube_video_id
    if not video_id:
        logger.warning(
            "micro_clip_generator: lineup %s has no youtube_video_id — "
            "cannot clip",
            lineup.id,
        )
        return MicroClipGenerationResult(
            stand_status="skipped",
            aim_status="skipped",
            stand_skip_reason="no_source_video",
            aim_skip_reason="no_source_video",
        )

    # Two valid input shapes:
    #   - Backfill: both precomputed values None → generator runs both
    #     classifier pipelines internally.
    #   - Ingest:  precomputed_stand_ts set; precomputed_release_ts MAY be
    #     None (when the orchestrator's THROW clip step skipped/failed —
    #     STAND still generates, AIM is skipped).
    # The only invalid shape is "stand None but release set", which would
    # mean the caller has release_ts without stand_ts — a wiring bug. There
    # is no concept of "AIM-only" without STAND on the ingest path.
    if precomputed_stand_ts is None and precomputed_release_ts is not None:
        logger.warning(
            "micro_clip_generator: lineup %s — precomputed_release_ts set "
            "without precomputed_stand_ts; got stand=None release=%s",
            lineup.id, precomputed_release_ts,
        )
        return MicroClipGenerationResult(
            stand_status="failed",
            aim_status="failed",
            stand_error_codes=["precomputed_pair_mismatch"],
            aim_error_codes=["precomputed_pair_mismatch"],
            reasoning="precomputed_release_ts requires precomputed_stand_ts",
        )

    owns_video = video_path is None
    local_video: Optional[Path] = video_path

    try:
        # ---- Resolve video path (download if needed) ----------------------
        if local_video is None:
            if download_dir is None:
                logger.warning(
                    "micro_clip_generator: lineup %s — no video_path and no "
                    "download_dir; cannot re-fetch source",
                    lineup.id,
                )
                return MicroClipGenerationResult(
                    stand_status="failed",
                    aim_status="failed",
                    stand_error_codes=["no_download_dir"],
                    aim_error_codes=["no_download_dir"],
                    reasoning="re-fetch requested but no download_dir provided",
                )
            try:
                local_video = await download_video(video_id, download_dir)
            except VideoDownloadError as exc:
                logger.warning(
                    "micro_clip_generator: source re-fetch failed: lineup=%s "
                    "video_id=%s error_type=%s message=%s",
                    lineup.id, video_id, exc.error_type, str(exc),
                )
                return MicroClipGenerationResult(
                    stand_status="failed",
                    aim_status="failed",
                    stand_error_codes=[f"download:{exc.error_type}"],
                    aim_error_codes=[f"download:{exc.error_type}"],
                    reasoning=f"video re-fetch failed: {exc}",
                )

        # ---- Resolve anchor timestamps ------------------------------------
        # STAND and AIM resolve independently:
        #   - STAND comes from the grid classifier (precomputed on ingest;
        #     re-run on backfill).
        #   - AIM comes from release_ts − _AIM_PRE_RELEASE_SECONDS, where
        #     release_ts is from the throw-localizer (precomputed on ingest;
        #     re-run on backfill).
        # Either side can independently end up "skipped" with structured
        # reasoning so the operator can see why per-side without inspecting
        # logs. The other side still runs normally.
        stand_ts: Optional[float] = None
        aim_ts: Optional[float] = None
        stand_skip_reason: Optional[str] = None
        aim_skip_reason: Optional[str] = None
        stand_err_codes: list[str] = []
        aim_err_codes: list[str] = []
        reasoning_parts: list[str] = []

        if precomputed_stand_ts is not None:
            # Ingest path — caller already has both sides' Claude output.
            stand_ts = float(precomputed_stand_ts)
            if precomputed_release_ts is not None:
                aim_ts = float(precomputed_release_ts) - _AIM_PRE_RELEASE_SECONDS
            else:
                # Orchestrator's THROW clip step skipped/failed — STAND
                # generates, AIM is skipped (the previous grid-based AIM
                # was unreliable; refusing is preferable to faking).
                aim_skip_reason = "no_release_ts_for_aim"
        else:
            # Backfill path — generator orchestrates both classifier passes
            # itself. Stand and aim resolve independently so a failure on
            # one side doesn't poison the other.
            if not settings.enable_classifier:
                return MicroClipGenerationResult(
                    stand_status="skipped",
                    aim_status="skipped",
                    stand_skip_reason="classifier_disabled",
                    aim_skip_reason="classifier_disabled",
                    reasoning="ENABLE_CLASSIFIER=false; backfill cannot localise frames",
                )
            if not settings.anthropic_api_key:
                return MicroClipGenerationResult(
                    stand_status="skipped",
                    aim_status="skipped",
                    stand_skip_reason="classifier_unavailable:missing_api_key",
                    aim_skip_reason="classifier_unavailable:missing_api_key",
                    reasoning="anthropic_api_key not configured",
                )

            # STAND from grid classifier.
            stand_ts, stand_err_codes, stand_reasoning = (
                await _resolve_stand_ts_via_grid_classifier(
                    db, lineup, local_video, chapter_start, chapter_end,
                )
            )
            if stand_reasoning:
                reasoning_parts.append(f"stand: {stand_reasoning}")
            if stand_ts is None and not stand_err_codes:
                stand_skip_reason = "backfill_not_a_lineup"

            # AIM from throw-localizer (independent — runs even if stand failed).
            release_ts, aim_err_codes, aim_reasoning = (
                await _resolve_release_ts_via_throw_localizer(
                    lineup, local_video, chapter_start, chapter_end,
                )
            )
            if aim_reasoning:
                reasoning_parts.append(f"aim: {aim_reasoning}")
            if release_ts is not None:
                aim_ts = release_ts - _AIM_PRE_RELEASE_SECONDS
            elif not aim_err_codes:
                aim_skip_reason = "backfill_no_throw_release"

        reasoning = " | ".join(reasoning_parts) if reasoning_parts else ""

        # Hard fail-out only when BOTH sides resolved to nothing AND both
        # have hard errors — the symmetric ingest-skipped case (no release
        # → AIM skipped, STAND generates) must not be turned into a failure.
        if (
            stand_ts is None
            and aim_ts is None
            and stand_err_codes
            and aim_err_codes
        ):
            return MicroClipGenerationResult(
                stand_status="failed",
                aim_status="failed",
                stand_error_codes=list(stand_err_codes),
                aim_error_codes=list(aim_err_codes),
                reasoning=reasoning,
            )

        # Compute the wider-source start the served 1s clip's offset will be
        # measured against. The micro-clip "shift window" editor (PR2) reads
        # ``stand_clip_offset_s`` / ``aim_clip_offset_s`` to position its
        # slider inside the SHARED wider source ``clip_url_original`` — micro
        # widening reuses the chapter's existing wider source bytes rather
        # than cutting a per-pane original. The offset is only meaningful
        # when a real wider source exists for THIS lineup (clip_url_original
        # set AND distinct from clip_url — if they match, clip_generator fell
        # back to the legacy "*_url_original = *_url" posture and there's no
        # wider source to index into). Settings used here MUST match the
        # settings used to cut clip_url_original — in the ingest path they
        # always do because both runs happen in the same orchestrator pass;
        # in the standalone backfill the call site doesn't persist offsets so
        # this branch is bypassed.
        wider_source_start_s: float | None = None
        if (
            lineup.clip_url_original is not None
            and lineup.clip_url_original != lineup.clip_url
        ):
            source_start, _source_duration = wide_source_bounds(
                float(chapter_start),
                float(chapter_end),
                pre_seconds=settings.clip_source_pre_seconds,
                post_seconds=settings.clip_source_post_seconds,
            )
            wider_source_start_s = source_start

        # ---- Cut + upload + persist each side independently ---------------
        # A None anchor_ts means the side's resolution step already decided
        # to skip / fail this side. Short-circuit before the cut so we don't
        # ffmpeg-attempt against missing data; the outcome dict matches the
        # _cut_upload_persist_one_side shape so the result composition below
        # is unchanged.
        if stand_ts is None:
            stand_outcome = {
                "status": "failed" if stand_err_codes else "skipped",
                "error_codes": list(stand_err_codes),
                "skip_reason": stand_skip_reason,
            }
        else:
            stand_outcome = await _cut_upload_persist_one_side(
                db, lineup, video_id, local_video,
                anchor_ts=stand_ts,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                side="stand",
                key_fn=pending_stand_clip_key,
                persist_fn=lineup_repo.set_stand_clip_url,
                wider_source_start_s=wider_source_start_s,
            )
        if aim_ts is None:
            aim_outcome = {
                "status": "failed" if aim_err_codes else "skipped",
                "error_codes": list(aim_err_codes),
                "skip_reason": aim_skip_reason,
            }
        else:
            aim_outcome = await _cut_upload_persist_one_side(
                db, lineup, video_id, local_video,
                anchor_ts=aim_ts,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                side="aim",
                key_fn=pending_aim_clip_key,
                persist_fn=lineup_repo.set_aim_clip_url,
                wider_source_start_s=wider_source_start_s,
            )

        return MicroClipGenerationResult(
            stand_status=stand_outcome["status"],
            aim_status=aim_outcome["status"],
            stand_clip_key=stand_outcome.get("clip_key"),
            aim_clip_key=aim_outcome.get("clip_key"),
            stand_skip_reason=stand_outcome.get("skip_reason"),
            aim_skip_reason=aim_outcome.get("skip_reason"),
            stand_error_codes=stand_outcome.get("error_codes", []),
            aim_error_codes=aim_outcome.get("error_codes", []),
            stand_ts=stand_ts,
            aim_ts=aim_ts,
            reasoning=reasoning,
        )
    finally:
        if owns_video and local_video is not None:
            try:
                local_video.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "micro_clip_generator: failed to delete re-fetched "
                    "video: path=%s error=%s",
                    local_video, str(exc),
                )


async def _cut_upload_persist_one_side(
    db: AsyncSession,
    lineup: Lineup,
    video_id: str,
    local_video: Path,
    *,
    anchor_ts: float,
    chapter_start: float,
    chapter_end: float,
    side: str,
    key_fn,
    persist_fn,
    wider_source_start_s: float | None = None,
) -> dict:
    """Cut + upload + persist exactly ONE side (stand or aim).

    Returns a flat dict consumed by ``generate_micro_clips_for_lineup`` —
    not a dataclass because the caller flattens the two sides into the
    composite ``MicroClipGenerationResult``. The same shape is used for
    both sides so a future third pane (unlikely but possible) can be added
    without touching this function.

    *wider_source_start_s* is the seconds-into-source-video start of the
    SHARED wider clip (``clip_url_original``) the operator's shift-window
    slider will be positioned against. When set, this function computes
    ``offset_s = clip_start - wider_source_start_s`` and persists it via the
    setter's ``offset_s=`` kwarg so the shift overlay opens at the right
    initial thumb position. When None (no wider source for this lineup),
    the offset is left untouched in the DB and the shift overlay opens at 0.
    """
    bounds = _compute_micro_bounds(
        anchor_ts,
        chapter_start,
        chapter_end,
        clip_seconds=_micro_clip_seconds_for_side(side),
    )
    if bounds is None:
        return {
            "status": "skipped",
            "skip_reason": "chapter_too_short_for_microclip",
        }
    clip_start, clip_duration = bounds

    try:
        clip_bytes = await cut_clip(local_video, clip_start, clip_duration)
    except ClipCutError as exc:
        logger.warning(
            "micro_clip_generator: %s clip cut failed: lineup=%s video_id=%s "
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
            "micro_clip_generator: %s clip upload failed: lineup=%s key=%s "
            "error=%s",
            side, lineup.id, clip_key, str(exc),
        )
        return {
            "status": "failed",
            "error_codes": ["clip_upload_failed"],
        }

    # Compute the in-source offset (only when a shared wider source exists for
    # this lineup). The setter writes ``*_clip_offset_s`` so the PR2 shift
    # overlay opens its slider at the position the ingest pipeline cut from.
    if wider_source_start_s is not None:
        offset_s: float | None = clip_start - wider_source_start_s
    else:
        offset_s = None

    try:
        await persist_fn(db, lineup, clip_key, offset_s=offset_s)
    except Exception as exc:
        # Object uploaded but column did not commit. The key is deterministic
        # so a later backfill recomputes the same key and overwrites the same
        # object — no orphan, safe to retry.
        logger.warning(
            "micro_clip_generator: %s_clip_url persist failed (object "
            "uploaded, column not committed; backfill is idempotent): "
            "lineup=%s key=%s error=%s",
            side, lineup.id, clip_key, str(exc),
        )
        return {
            "status": "failed",
            "error_codes": [f"{side}_clip_url_persist_failed"],
        }

    logger.info(
        "micro_clip_generator: %s clip generated: lineup=%s video_id=%s "
        "key=%s anchor_ts=%.2f clip=[%.2f,+%.2fs]",
        side, lineup.id, video_id, clip_key, anchor_ts,
        clip_start, clip_duration,
    )
    return {"status": "generated", "clip_key": clip_key}
