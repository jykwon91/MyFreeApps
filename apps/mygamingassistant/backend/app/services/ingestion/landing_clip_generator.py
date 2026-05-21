"""Landing-clip generator — short looping clip of where the utility LANDS.

PR4 introduced the 2×2 storyboard tile (STAND still + AIM still + THROW clip +
LANDING text). PR5 replaces the LANDING text placeholder with a short looping
clip of the moment the utility actually lands/explodes — smoke deploying, molly
burning, flash detonation, ability resolving. The text fallback ("Lands in:
<zone>") remains the always-valid graceful degradation when no landing clip
exists, exactly like the stills remain the fallback for the THROW clip.

End-to-end:

  1. Two entry paths share a single gate-passing contract:

     a. **Ingest** — the orchestrator already ran PR2's throw-timing
        classifier inside ``clip_generator``. It passes the resolved
        ``precomputed_result_ts`` (PR2's ``result_ts``) directly. We skip the
        classifier call entirely (cost saving: one Claude call per chapter
        instead of two) and skip the gates because PR2 already cleared them.

     b. **Backfill** — standalone CLI run. ``precomputed_result_ts`` is None,
        so we run ``classify_throw_timing_from_frames`` ourselves and apply
        the same gates PR2 uses (not-a-throw / low-confidence / no-result
        frame → skip).

  2. Anchor the clip on the LANDING moment (``result_ts``). PR2's throw clip
     covers ``[release - 2.0, result + 0.5]`` — the throw motion — and crops
     the post-landing tail tight. PR5's landing clip inverts the framing:
     start just before the landing and dwell on the AFTER (``[result - 0.5,
     result + 3.0]`` ≈ 3.5s). The two clips are deliberately offset so a
     viewer sees motion in BOTH panes for the same lineup.

  3. Cut + encode the muted MP4 via :func:`cut_clip` (re-uses PR2's ffmpeg
     wrapper — same encode contract, same ``+faststart``), upload to MinIO
     under a deterministic key, persist the bare key.

Idempotent: the MinIO key is ``pending/{video_id}/{int(chapter_start)}-landing.mp4``;
re-running overwrites the same object instead of orphaning a new one. The
DB write is a single-column commit through :func:`lineup_repo.set_landing_clip_url`
— a landing-clip failure NEVER rolls back the already-committed lineup, PR2
throw clip, or PR3 technique. Mirrors :mod:`clip_generator` exactly.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): yt-dlp / ffmpeg / Claude failures
are captured with structured codes, logged at WARNING, and returned as
``status="failed"`` with ``error_codes``. ``landing_clip_url`` is left NULL
and the LandingPane renders its text fallback. Nothing silent-fails.
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
    classify_throw_timing_from_frames,
)
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
    clip_window_timestamps,
    cut_clip,
    extract_frames_downscaled,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)

# Frozen design-contract constants. The 0.55 gate matches PR2's throw clip —
# if PR2 cleared its gate, the landing pass shares that judgment (so a clip
# is generated or both are skipped together, never one without the other).
_CLIP_CONFIDENCE_GATE = 0.55
# Lead-in kept before landing / dwell time on the post-landing scene. The
# 3.0s tail is the visible distinction from PR2's clip — PR2 cuts at result
# + 0.5s, so landing gets a separate 3.5s pane focused on the after-effect
# (smoke at full coverage, molly burn pattern, flash radius).
_PRE_LANDING_SECONDS = 0.5
_POST_LANDING_SECONDS = 3.0
# Tight bounds — the landing pane is the smallest of the 2×2 storyboard.
_MIN_CLIP_SECONDS = 1.0
_TARGET_CLIP_SECONDS = _PRE_LANDING_SECONDS + _POST_LANDING_SECONDS  # 3.5s


@dataclass
class LandingClipGenerationResult:
    """Structured outcome of a landing-clip-generation attempt.

    Mirrors :class:`clip_generator.ClipGenerationResult` so the orchestrator's
    summary logging and the backfill stats can route on ``status`` uniformly.

    ``status`` is one of:
      - ``"generated"`` — clip cut, uploaded, ``landing_clip_url`` committed.
        ``clip_key`` is set.
      - ``"skipped"``   — deliberately no clip (not a throw / low confidence /
        no result frame / chapter too short / classifier disabled / no
        precomputed result_ts when called from ingest). NOT an error; the
        LandingPane gracefully falls back to "Lands in: <zone>" text.
      - ``"failed"``    — an operational failure (download / extract / cut /
        upload / Claude API). ``error_codes`` carries the structured reason;
        ``landing_clip_url`` is left NULL; the lineup still works from its
        stills + (possibly) throw clip + zone text. A later backfill run can
        retry.
    """

    status: str
    clip_key: Optional[str] = None
    skip_reason: Optional[str] = None
    error_codes: list[str] = field(default_factory=list)
    reasoning: str = ""
    confidence: Optional[float] = None
    is_lineup_throw: Optional[bool] = None
    result_ts: Optional[float] = None
    clip_start: Optional[float] = None
    clip_duration: Optional[float] = None


def pending_landing_clip_key(video_id: str, chapter_start_seconds: float) -> str:
    """Deterministic MinIO key for a lineup's landing clip.

    Parallel to PR2's :func:`clip_generator.pending_clip_key` — same shape,
    different suffix. One key per (video, chapter start) makes the backfill
    idempotent: re-running overwrites the same object instead of orphaning a
    new one.
    """
    return f"pending/{video_id}/{int(chapter_start_seconds)}-landing.mp4"


def _compute_landing_bounds(
    result_ts: float,
    chapter_start: float,
    chapter_end: float,
) -> Optional[tuple[float, float]]:
    """Return ``(clip_start, clip_duration)`` seconds, or None if too short.

    Centered on the landing: ``[result - 0.5, result + 3.0]`` clamped to the
    chapter. Returns None when the clamped window is shorter than 1s (the
    chapter has no headroom around the landing to carry a meaningful clip),
    so the caller skips. We deliberately do NOT rebuild a target-length
    window — for landing-clip the WHERE is more important than the
    HOW-LONG, and a clamped sliver is more informative than a fabricated
    one displaced to a different chapter region.
    """
    start = max(result_ts - _PRE_LANDING_SECONDS, chapter_start)
    end = min(result_ts + _POST_LANDING_SECONDS, chapter_end)
    duration = end - start
    if duration < _MIN_CLIP_SECONDS:
        return None
    return start, duration


async def generate_landing_clip_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    chapter_start: float,
    chapter_end: float,
    video_path: Optional[Path] = None,
    download_dir: Optional[Path] = None,
    utility_hint: Optional[str] = None,
    precomputed_result_ts: Optional[float] = None,
    precomputed_confidence: Optional[float] = None,
) -> LandingClipGenerationResult:
    """Cut a landing clip for *lineup*; persist ``landing_clip_url``.

    Two entry paths:

    **Ingest path** — caller (orchestrator) passes ``precomputed_result_ts``
    from PR2's :class:`clip_generator.ClipGenerationResult`. We skip the
    Claude classifier call entirely and skip the gates (PR2 already cleared
    them). Cost: zero extra Claude spend; just an extra ffmpeg cut + MinIO
    upload per chapter.

    **Backfill path** — caller is the CLI; ``precomputed_result_ts`` is
    None. We run ``classify_throw_timing_from_frames`` ourselves (cost: one
    Claude call per lineup) and apply the same gates as PR2.

    Args:
        db: Active async session. On success the bare landing-clip key is
            committed via ``lineup_repo.set_landing_clip_url`` (its own
            one-column commit per PR #687/#695).
        lineup: The row to clip. ``youtube_video_id`` must be set.
        chapter_start / chapter_end: Source chapter bounds in seconds.
        video_path: Already-downloaded source video to reuse (ingest /
            backfill that batches per video). When None the video is
            re-fetched into *download_dir* and deleted afterwards.
        download_dir: Required when *video_path* is None.
        utility_hint: Utility slug for the throw-timing RESULT cue.
            Ignored when ``precomputed_result_ts`` is set.
        precomputed_result_ts: PR2's ``result_ts`` if PR2's gate passed in
            this same ingest call. Set this to skip the classifier call.
        precomputed_confidence: PR2's confidence (purely informational —
            propagated to the result for logging).

    Returns:
        LandingClipGenerationResult — see its docstring for ``status``
        semantics. Never raises for an expected failure.
    """
    video_id = lineup.youtube_video_id
    if not video_id:
        logger.warning(
            "landing_clip_generator: lineup %s has no youtube_video_id — "
            "cannot clip",
            lineup.id,
        )
        return LandingClipGenerationResult(
            status="skipped", skip_reason="no_source_video"
        )

    # Resolve result_ts. Two paths: precomputed (ingest) or classify-ourselves
    # (backfill). The precomputed path encodes PR2's gate decision — if the
    # caller did not pass result_ts, that is itself a "gate decided no" signal
    # and we skip silently with a matching reason.
    if precomputed_result_ts is None:
        # ---- Backfill path: run our own classifier ---------------------
        if not settings.enable_classifier:
            return LandingClipGenerationResult(
                status="skipped", skip_reason="classifier_disabled"
            )
        if not settings.anthropic_api_key:
            return LandingClipGenerationResult(
                status="skipped",
                skip_reason="classifier_unavailable:missing_api_key",
            )

        timestamps = clip_window_timestamps(chapter_start, chapter_end)
        if not timestamps:
            return LandingClipGenerationResult(
                status="skipped", skip_reason="empty_clip_window"
            )

        owns_video = video_path is None
        local_video: Optional[Path] = video_path
        try:
            if local_video is None:
                if download_dir is None:
                    logger.warning(
                        "landing_clip_generator: lineup %s — no video_path "
                        "and no download_dir; cannot re-fetch source",
                        lineup.id,
                    )
                    return LandingClipGenerationResult(
                        status="failed",
                        error_codes=["no_download_dir"],
                        reasoning="Re-fetch requested but no download_dir provided",
                    )
                try:
                    local_video = await download_video(video_id, download_dir)
                except VideoDownloadError as exc:
                    logger.warning(
                        "landing_clip_generator: source re-fetch failed: "
                        "lineup=%s video_id=%s error_type=%s message=%s",
                        lineup.id, video_id, exc.error_type, str(exc),
                    )
                    return LandingClipGenerationResult(
                        status="failed",
                        error_codes=[f"download:{exc.error_type}"],
                        reasoning=f"Video re-fetch failed: {exc}",
                    )

            try:
                frames = await extract_frames_downscaled(local_video, timestamps)
            except FrameExtractionError as exc:
                logger.warning(
                    "landing_clip_generator: downscaled frame extraction "
                    "failed: lineup=%s video_id=%s returncode=%s stderr=%s",
                    lineup.id, video_id, exc.returncode, exc.stderr[:300],
                )
                return LandingClipGenerationResult(
                    status="failed",
                    error_codes=[f"frame_extract:rc={exc.returncode}"],
                    reasoning=f"Downscaled frame extraction failed: {exc}",
                )

            chapter_duration = float(chapter_end) - float(chapter_start)
            timing = await classify_throw_timing_from_frames(
                frames=frames,
                frame_timestamps=timestamps,
                chapter_title=lineup.chapter_title,
                chapter_duration=chapter_duration,
                utility_hint=utility_hint,
            )
            if not timing.success:
                logger.warning(
                    "landing_clip_generator: throw-timing call failed: "
                    "lineup=%s video_id=%s error_codes=%s reasoning=%s",
                    lineup.id, video_id, timing.error_codes, timing.reasoning,
                )
                return LandingClipGenerationResult(
                    status="failed",
                    error_codes=list(timing.error_codes),
                    reasoning=timing.reasoning,
                )

            # Apply PR2's gates (same order, same constants — the two pipelines
            # share judgment).
            if not timing.is_lineup_throw:
                return LandingClipGenerationResult(
                    status="skipped",
                    skip_reason="not_a_throw",
                    is_lineup_throw=False,
                    confidence=timing.confidence,
                    reasoning=timing.reasoning,
                )
            if (
                timing.confidence is None
                or timing.confidence < _CLIP_CONFIDENCE_GATE
            ):
                return LandingClipGenerationResult(
                    status="skipped",
                    skip_reason=f"low_confidence:{timing.confidence}",
                    is_lineup_throw=True,
                    confidence=timing.confidence,
                    reasoning=timing.reasoning,
                )
            if timing.result_index is None:
                return LandingClipGenerationResult(
                    status="skipped",
                    skip_reason="no_result_frame",
                    is_lineup_throw=True,
                    confidence=timing.confidence,
                    reasoning=timing.reasoning,
                )

            result_ts = timestamps[timing.result_index - 1]
            confidence_for_logging = timing.confidence
            reasoning_for_logging = timing.reasoning

            return await _cut_upload_persist(
                db, lineup, video_id, local_video,
                result_ts, chapter_start, chapter_end,
                confidence_for_logging, reasoning_for_logging,
                is_lineup_throw=True,
            )
        finally:
            if owns_video and local_video is not None:
                try:
                    local_video.unlink(missing_ok=True)
                except OSError as exc:
                    logger.warning(
                        "landing_clip_generator: failed to delete re-fetched "
                        "video: path=%s error=%s",
                        local_video, str(exc),
                    )
    else:
        # ---- Ingest path: precomputed result_ts -----------------------
        # The caller (orchestrator) only passes precomputed_result_ts after
        # PR2's clip_generator returned status="generated", so the gates
        # already cleared. We still validate video_path is set (ingest must
        # reuse the on-disk video — re-downloading during ingest is a bug).
        if video_path is None:
            logger.warning(
                "landing_clip_generator: lineup %s — precomputed_result_ts "
                "set but no video_path provided. Ingest should reuse the "
                "on-disk video; this is a wiring bug.",
                lineup.id,
            )
            return LandingClipGenerationResult(
                status="failed",
                error_codes=["no_video_path_with_precomputed"],
                reasoning="precomputed_result_ts requires video_path",
            )

        return await _cut_upload_persist(
            db, lineup, video_id, video_path,
            precomputed_result_ts, chapter_start, chapter_end,
            precomputed_confidence, "",
            is_lineup_throw=True,
        )


async def _cut_upload_persist(
    db: AsyncSession,
    lineup: Lineup,
    video_id: str,
    local_video: Path,
    result_ts: float,
    chapter_start: float,
    chapter_end: float,
    confidence: Optional[float],
    reasoning: str,
    *,
    is_lineup_throw: bool,
) -> LandingClipGenerationResult:
    """Shared tail of the pipeline: bounds → ffmpeg cut → MinIO upload → DB commit.

    Both the precomputed (ingest) and classify-ourselves (backfill) paths
    converge here. Factored out so the gating/timing logic above stays
    linear and the failure-handling shape is identical in both paths.
    """
    bounds = _compute_landing_bounds(
        result_ts, float(chapter_start), float(chapter_end)
    )
    if bounds is None:
        return LandingClipGenerationResult(
            status="skipped",
            skip_reason="chapter_too_short_for_landing_clip",
            is_lineup_throw=is_lineup_throw,
            confidence=confidence,
            reasoning=reasoning,
            result_ts=result_ts,
        )
    clip_start, clip_duration = bounds

    # ---- Cut + encode the muted clip --------------------------------
    try:
        clip_bytes = await cut_clip(local_video, clip_start, clip_duration)
    except ClipCutError as exc:
        logger.warning(
            "landing_clip_generator: clip cut failed: lineup=%s video_id=%s "
            "start=%.2f dur=%.2f returncode=%s stderr=%s",
            lineup.id, video_id, clip_start, clip_duration,
            exc.returncode, exc.stderr[:300],
        )
        return LandingClipGenerationResult(
            status="failed",
            error_codes=[f"clip_cut:rc={exc.returncode}"],
            reasoning=f"ffmpeg landing-clip cut failed: {exc}",
            result_ts=result_ts,
            clip_start=clip_start,
            clip_duration=clip_duration,
        )

    # ---- Upload + persist the bare key ------------------------------
    clip_key = pending_landing_clip_key(video_id, chapter_start)
    try:
        storage = get_storage()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, storage.upload_file, clip_key, clip_bytes, "video/mp4"
        )
    except Exception as exc:
        logger.warning(
            "landing_clip_generator: clip upload failed: lineup=%s key=%s "
            "error=%s",
            lineup.id, clip_key, str(exc),
        )
        return LandingClipGenerationResult(
            status="failed",
            error_codes=["clip_upload_failed"],
            reasoning=f"MinIO landing-clip upload failed: {exc}",
            result_ts=result_ts,
            clip_start=clip_start,
            clip_duration=clip_duration,
        )

    try:
        await lineup_repo.set_landing_clip_url(db, lineup, clip_key)
    except Exception as exc:
        # The object is uploaded but the column did not commit. The key is
        # deterministic, so a later backfill recomputes the same key and
        # overwrites the same object — no orphan, safe to retry.
        logger.warning(
            "landing_clip_generator: landing_clip_url persist failed "
            "(object uploaded, column not committed; backfill is "
            "idempotent): lineup=%s key=%s error=%s",
            lineup.id, clip_key, str(exc),
        )
        return LandingClipGenerationResult(
            status="failed",
            error_codes=["landing_clip_url_persist_failed"],
            reasoning=f"landing_clip_url commit failed: {exc}",
            result_ts=result_ts,
            clip_start=clip_start,
            clip_duration=clip_duration,
        )

    logger.info(
        "landing_clip_generator: clip generated: lineup=%s video_id=%s "
        "key=%s result_ts=%.2f clip=[%.2f,+%.2fs] confidence=%s",
        lineup.id, video_id, clip_key, result_ts,
        clip_start, clip_duration,
        f"{confidence:.2f}" if confidence is not None else "n/a",
    )
    return LandingClipGenerationResult(
        status="generated",
        clip_key=clip_key,
        is_lineup_throw=is_lineup_throw,
        confidence=confidence,
        reasoning=reasoning,
        result_ts=result_ts,
        clip_start=clip_start,
        clip_duration=clip_duration,
    )
