"""Stand + Aim micro-clip generator — 1s looped clips for the storyboard.

PR6 introduced the 1-second STAND + AIM micro-clips replacing static stills.
Anchor sources differ per side (operator-tuned 2026-05-23):

  - **STAND** anchors on the grid classifier's chosen ``stand`` frame
    (``timestamps[stand_idx]``). The 9-frame grid reliably catches the
    "I am at the spot" window (many seconds long).
  - **AIM** anchors on ``release_ts − _AIM_PRE_RELEASE_SECONDS`` (0.8s
    before the throw-localizer's release frame). The aim moment is
    sub-second; the grid is far too sparse to catch it reliably — Claude
    was picking random distant frames. The throw-timing dense pass
    (0.5s spacing around release) already sees the locked-aim moment.

Two entry paths share one contract:

  1. **Ingest path** — orchestrator passes ``precomputed_stand_ts`` (from
     its grid run) AND ``precomputed_release_ts`` (from the throw-localizer
     it already ran for the THROW clip). Generator skips both Claude calls.
  2. **Backfill path** — both precomputed values are None; generator runs
     the grid classifier (stand) AND ``localize_throw_with_refinement``
     (release → aim) itself. Cost: 1 grid + 1-2 throw-timing calls.

Per-side independence: a stand-side failure NEVER rolls back the already-
committed aim side, and vice versa. The AIM still + persisted aim_anchor
coords are NOT recut — phase-1 scope is the clip only; the brief poster
flash + rarely-used still-mode fallback are accepted-imperfections. See
``project_mga_aim_anchor_center_screen_invariant.md`` in auto-memory.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): every yt-dlp / ffmpeg / Claude
failure is captured with structured codes, logged at WARNING, and returned
in the per-side error_codes; the matching ``*_clip_url`` is left NULL and
the pane renders its still fallback. Nothing silent-fails.

Sibling helpers (``_resolve_stand_ts_via_grid_classifier``,
``_resolve_release_ts_via_throw_localizer``, ``_cut_upload_persist_one_side``)
live in :mod:`micro_clip_helpers` to keep this file under the file-size
growth guard (per per-app Tech Debt Policy).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.frame_extractor import (
    wide_source_bounds,
)
from app.services.ingestion.micro_clip_helpers import (
    _cut_upload_persist_one_side,
    _resolve_release_ts_via_throw_localizer,
    _resolve_stand_ts_via_grid_classifier,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)

# Per-pane micro-clip durations. STAND is 2.0s (operator-tuned: 1.0s cut
# off mid-stance). AIM stays at 1.0s — longer bleeds into the THROW pane's
# window.
_STAND_MICRO_CLIP_SECONDS = 2.0
_AIM_MICRO_CLIP_SECONDS = 1.0
# Seconds BEFORE release_ts the AIM clip starts at. The 1.0s AIM clip
# spans [release − 0.8s, release + 0.2s] — locked-aim with a tiny throw-
# initiation peek as a natural end-cue.
_AIM_PRE_RELEASE_SECONDS = 0.8
# Minimum acceptable clamped duration. Below: skip rather than ship a sliver.
_MIN_CLIP_SECONDS = 0.5


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
                clip_seconds=_STAND_MICRO_CLIP_SECONDS,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                side="stand",
                key_fn=pending_stand_clip_key,
                persist_fn=lineup_repo.set_stand_clip_url,
                wider_source_start_s=wider_source_start_s,
                min_clip_seconds=_MIN_CLIP_SECONDS,
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
                clip_seconds=_AIM_MICRO_CLIP_SECONDS,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                side="aim",
                key_fn=pending_aim_clip_key,
                persist_fn=lineup_repo.set_aim_clip_url,
                wider_source_start_s=wider_source_start_s,
                min_clip_seconds=_MIN_CLIP_SECONDS,
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


