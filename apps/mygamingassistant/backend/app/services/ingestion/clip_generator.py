"""Clip generator — produce a short gif-style throw clip for one lineup.

The two ingested stills (stand + aim) structurally cannot represent a lineup:
a lineup is a *motion*. This service localises the throw within its source
chapter and cuts a tight, muted, looping MP4 around it so the glance board can
autoplay it like a gif. The stills remain the always-valid fallback — a clip
is best-effort and never required for a lineup to be usable.

End-to-end (the frozen design contract, pr2-clip-localization-design.md):

  1. Sample a dense frame window over the throw portion of the chapter
     (``frame_extractor.clip_window_timestamps`` — trims the walk-in / talk
     lead-in).
  2. Downscale-extract those frames (cheap; throw *timing* doesn't need full
     pixels).
  3. Ask Claude to localise the RELEASE and RESULT frames
     (``classify_throw_timing_from_frames`` — a separate code path from the
     game/map grid classifier).
  4. Gate: skip (keep stills) when it is not a throw, confidence < 0.55, or no
     release frame was found.
  5. Turn the release index back into a timestamp, compute a tight
     ~2s clip window anchored entirely on release_ts, clamp to the chapter.
  6. Re-use the already-downloaded video (ingest) or re-fetch it by
     ``youtube_video_id`` (backfill), cut + encode a small muted MP4, upload
     to MinIO under a deterministic key, and persist the bare key on the row.

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): yt-dlp / ffmpeg / Claude failures are
captured with their structured codes, logged at WARNING with the reason, and
returned as ``status="failed"`` with ``error_codes``. ``clip_url`` is left
NULL and the lineup stays fully usable from its stills. Nothing silent-fails.
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
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
    cut_clip,
)
from app.services.ingestion.throw_localizer import (
    localize_throw_with_refinement,
)
from app.services.ingestion.wide_source import (
    cut_and_upload_wide_source,
    tight_offsets_within_source,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)

# Frozen design-contract constants. The 0.55 gate accepts both
# "inferred-from-trajectory" (0.55-0.79) and direct observation (>=0.80);
# below 0.55 the dense window missed the throw and the stills are the right
# artifact.
_CLIP_CONFIDENCE_GATE = 0.55
# Throw clip is anchored ENTIRELY on release_ts: the throw pane's job is the
# throw MOTION (windup → release → follow-through), which spans ~0.4-0.9s
# pre-release windup + ~0.5-1.0s post-release follow-through. Earlier 2.0s
# lead-in showed ~1s of LOCKED AIM before windup — duplicating the AIM pane
# and surfaced as "THROW clip ~1s too long" on lineup 7bd971c3 (2026-05-24).
# Tail unchanged: prior `result_ts + 1.5s` was already replaced (PR #755) with
# release-anchored 1.0s because result_ts is the "first visible wisp"
# (1.5-3.0s after release) → bloom belongs in LANDING, not THROW.
_PRE_RELEASE_SECONDS = 1.0
_POST_RELEASE_SECONDS = 1.0
# Below this the chapter-clamped window is unusable → skip.
_ABSOLUTE_MIN_CLIP_SECONDS = 1.0


@dataclass
class ClipGenerationResult:
    """Structured outcome of a clip-generation attempt.

    ``status`` is one of:
      - ``"generated"`` — clip cut, uploaded, ``clip_url`` committed.
        ``clip_key`` is set.
      - ``"skipped"``   — deliberately no clip (not a throw / low confidence /
        no release frame / chapter too short / classifier disabled). NOT an
        error; the lineup is fully usable from its stills.
      - ``"failed"``    — an operational failure (download / extract / cut /
        upload / Claude API). ``error_codes`` carries the structured reason;
        ``clip_url`` is left NULL; the lineup still works from its stills. A
        later backfill run can retry.

    Never a bare bool/None — the caller and the backfill summary route on this
    (per rules/check-third-party-error-codes.md).
    """

    status: str
    clip_key: Optional[str] = None
    skip_reason: Optional[str] = None
    error_codes: list[str] = field(default_factory=list)
    reasoning: str = ""
    confidence: Optional[float] = None
    is_lineup_throw: Optional[bool] = None
    release_ts: Optional[float] = None
    result_ts: Optional[float] = None
    clip_start: Optional[float] = None
    clip_duration: Optional[float] = None


def pending_clip_key(video_id: str, chapter_start_seconds: float) -> str:
    """Deterministic MinIO key for a lineup's clip.

    Parallel to the ingestion screenshot keys
    (``pending/{video_id}/{start}-{slot}.png``) — and, like them, ingested
    rows keep this key after the operator accepts them (accept does not
    re-key MinIO objects). One key per (video, chapter start) makes the
    backfill idempotent: re-running overwrites the same object instead of
    orphaning a new one.
    """
    return f"pending/{video_id}/{int(chapter_start_seconds)}-clip.mp4"


def pending_clip_source_key(video_id: str, chapter_start_seconds: float) -> str:
    """Deterministic MinIO key for a lineup's wider source clip.

    Companion to :func:`pending_clip_key` — the trim editor reads from this
    wider clip via ``clip_url_original``. Distinct key suffix (``-source``)
    so the tight served clip and the wider trim source coexist in MinIO and
    a backfill run overwrites only the wide one without touching the tight
    bytes the glance board autoplays. One key per (video, chapter start)
    matches :func:`pending_clip_key`'s idempotence — re-running the
    widen-source backfill overwrites the same object instead of orphaning
    a new one.
    """
    return f"pending/{video_id}/{int(chapter_start_seconds)}-clip-source.mp4"


def _compute_clip_bounds(
    release_ts: float,
    chapter_start: float,
    chapter_end: float,
) -> Optional[tuple[float, float]]:
    """Return ``(clip_start, clip_duration)`` seconds, or None if too short.

    [release - _PRE_RELEASE_SECONDS, release + _POST_RELEASE_SECONDS] clamped
    to the chapter. The throw pane's job is the throw MOTION; anchoring the
    tail on release_ts (not result_ts, the "first visible wisp") keeps the
    clip tight on the action. Returns None when the chapter-clamped window
    is shorter than ``_ABSOLUTE_MIN_CLIP_SECONDS`` so the caller skips.
    """
    start = max(release_ts - _PRE_RELEASE_SECONDS, chapter_start)
    end = min(release_ts + _POST_RELEASE_SECONDS, chapter_end)
    duration = end - start

    if duration < _ABSOLUTE_MIN_CLIP_SECONDS:
        return None
    return start, duration


async def generate_clip_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    chapter_start: float,
    chapter_end: float,
    video_path: Optional[Path] = None,
    download_dir: Optional[Path] = None,
    utility_hint: Optional[str] = None,
) -> ClipGenerationResult:
    """Localise the throw and cut a clip for *lineup*; persist ``clip_url``.

    Args:
        db: Active async session. On success the bare clip key is committed
            via ``lineup_repo.set_clip_url`` (its own one-column commit — a
            clip failure must not roll back the already-committed lineup).
        lineup: The row to clip. ``youtube_video_id`` must be set (manual
            uploads have no source video — caller must not call this for
            them).
        chapter_start / chapter_end: The source chapter bounds in seconds.
            Ingest passes the parsed ``Chapter``; backfill re-derives the end
            from the re-fetched video metadata (this service does not store
            it).
        video_path: An already-downloaded source video to reuse (ingest). When
            None the video is re-fetched by ``youtube_video_id`` (backfill)
            into *download_dir* and deleted afterwards.
        download_dir: Required when *video_path* is None — where to download
            the re-fetched source.
        utility_hint: Utility slug from a prior grid classification at
            confidence > 0.6, if any — sharpens the RESULT cue.

    Returns:
        ClipGenerationResult — see its docstring for ``status`` semantics.
        Never raises for an expected failure; everything is captured into the
        result with structured ``error_codes`` and a WARNING log.
    """
    video_id = lineup.youtube_video_id
    if not video_id:
        # The caller is responsible for not calling this on manual uploads;
        # surface it loudly rather than silently no-op.
        logger.warning(
            "clip_generator: lineup %s has no youtube_video_id — cannot clip",
            lineup.id,
        )
        return ClipGenerationResult(
            status="skipped",
            skip_reason="no_source_video",
        )

    # Cheap exits before any download / Claude spend. The throw-timing call is
    # the clip gate; with no key (or the classifier disabled) we cannot judge
    # the throw, so there is nothing to clip — keep the stills.
    if not settings.enable_classifier:
        return ClipGenerationResult(
            status="skipped", skip_reason="classifier_disabled"
        )
    if not settings.anthropic_api_key:
        return ClipGenerationResult(
            status="skipped", skip_reason="classifier_unavailable:missing_api_key"
        )

    owns_video = video_path is None
    local_video: Optional[Path] = video_path
    try:
        # ---- Acquire the source video -----------------------------------
        if local_video is None:
            if download_dir is None:
                logger.warning(
                    "clip_generator: lineup %s — no video_path and no "
                    "download_dir; cannot re-fetch source",
                    lineup.id,
                )
                return ClipGenerationResult(
                    status="failed",
                    error_codes=["no_download_dir"],
                    reasoning="Re-fetch requested but no download_dir provided",
                )
            try:
                local_video = await download_video(video_id, download_dir)
            except VideoDownloadError as exc:
                logger.warning(
                    "clip_generator: source re-fetch failed: lineup=%s "
                    "video_id=%s error_type=%s message=%s",
                    lineup.id, video_id, exc.error_type, str(exc),
                )
                return ClipGenerationResult(
                    status="failed",
                    error_codes=[f"download:{exc.error_type}"],
                    reasoning=f"Video re-fetch failed: {exc}",
                )

        # ---- Two-stage throw localisation -------------------------------
        # Coarse N=12 grid over the throw window, then (when coarse cleared
        # the 0.55 refine gate) a dense N=8 pass at ~0.5s spacing around
        # the coarse-pass release for frame-accurate timing. The
        # orchestrator returns the dense result on success and falls back
        # to coarse on any dense-pass failure — never regresses the
        # pipeline (throw_localizer.py docstring covers the full decision
        # tree). FrameExtractionError on the *coarse* pass re-raises so
        # we surface the same structured failure we always have.
        try:
            refined = await localize_throw_with_refinement(
                local_video,
                chapter_start=chapter_start,
                chapter_end=chapter_end,
                chapter_title=lineup.chapter_title,
                utility_hint=utility_hint,
            )
        except FrameExtractionError as exc:
            logger.warning(
                "clip_generator: downscaled frame extraction failed: "
                "lineup=%s video_id=%s returncode=%s stderr=%s",
                lineup.id, video_id, exc.returncode, exc.stderr[:300],
            )
            return ClipGenerationResult(
                status="failed",
                error_codes=[f"frame_extract:rc={exc.returncode}"],
                reasoning=f"Downscaled frame extraction failed: {exc}",
            )

        timing = refined.timing
        timestamps = refined.frame_timestamps
        if not timing.success:
            logger.warning(
                "clip_generator: throw-timing call failed: lineup=%s "
                "video_id=%s stage=%s error_codes=%s reasoning=%s",
                lineup.id, video_id, refined.stage,
                timing.error_codes, timing.reasoning,
            )
            return ClipGenerationResult(
                status="failed",
                error_codes=list(timing.error_codes),
                reasoning=timing.reasoning,
            )

        # ---- Gate (frozen contract) ------------------------------------
        # Gate order mirrors the frozen contract: not-a-throw → low
        # confidence → no release frame. Low confidence is the more common
        # (and more actionable) root cause, so it is reported ahead of a
        # literally-absent release index.
        if not timing.is_lineup_throw:
            return ClipGenerationResult(
                status="skipped",
                skip_reason="not_a_throw",
                is_lineup_throw=False,
                confidence=timing.confidence,
                reasoning=timing.reasoning,
            )
        if timing.confidence is None or timing.confidence < _CLIP_CONFIDENCE_GATE:
            return ClipGenerationResult(
                status="skipped",
                skip_reason=f"low_confidence:{timing.confidence}",
                is_lineup_throw=True,
                confidence=timing.confidence,
                reasoning=timing.reasoning,
            )
        if timing.release_index is None:
            return ClipGenerationResult(
                status="skipped",
                skip_reason="no_release_frame",
                is_lineup_throw=True,
                confidence=timing.confidence,
                reasoning=timing.reasoning,
            )

        # ---- Indices → timestamps → clip bounds ------------------------
        release_ts = timestamps[timing.release_index - 1]
        # result_ts is no longer load-bearing for the clip window (the throw
        # pane is anchored entirely on release_ts) but is still surfaced on
        # the result row for diagnostics and used by the landing-clip path.
        if timing.result_index is not None:
            result_ts = timestamps[timing.result_index - 1]
        else:
            result_ts = release_ts

        bounds = _compute_clip_bounds(
            release_ts, float(chapter_start), float(chapter_end)
        )
        if bounds is None:
            return ClipGenerationResult(
                status="skipped",
                skip_reason="chapter_too_short_for_clip",
                is_lineup_throw=True,
                confidence=timing.confidence,
                reasoning=timing.reasoning,
                release_ts=release_ts,
                result_ts=result_ts,
            )
        clip_start, clip_duration = bounds

        # ---- Cut + encode the muted clip -------------------------------
        try:
            clip_bytes = await cut_clip(local_video, clip_start, clip_duration)
        except ClipCutError as exc:
            logger.warning(
                "clip_generator: clip cut failed: lineup=%s video_id=%s "
                "start=%.2f dur=%.2f returncode=%s stderr=%s",
                lineup.id, video_id, clip_start, clip_duration,
                exc.returncode, exc.stderr[:300],
            )
            return ClipGenerationResult(
                status="failed",
                error_codes=[f"clip_cut:rc={exc.returncode}"],
                reasoning=f"ffmpeg clip cut failed: {exc}",
                release_ts=release_ts,
                result_ts=result_ts,
                clip_start=clip_start,
                clip_duration=clip_duration,
            )

        # ---- Upload + persist the bare key -----------------------------
        clip_key = pending_clip_key(video_id, chapter_start)
        try:
            storage = get_storage()
            # upload_file is a blocking minio put_object — a clip MP4 is far
            # larger than a PNG screenshot, so run it off the event loop.
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None, storage.upload_file, clip_key, clip_bytes, "video/mp4"
            )
        except Exception as exc:
            logger.warning(
                "clip_generator: clip upload failed: lineup=%s key=%s "
                "error=%s",
                lineup.id, clip_key, str(exc),
            )
            return ClipGenerationResult(
                status="failed",
                error_codes=["clip_upload_failed"],
                reasoning=f"MinIO clip upload failed: {exc}",
                release_ts=release_ts,
                result_ts=result_ts,
                clip_start=clip_start,
                clip_duration=clip_duration,
            )

        # ---- Cut + upload the wider trim-editor source (best-effort) ---
        # Failure here keeps the row in the legacy posture (clip_url_original
        # = clip_url, NULL offsets) so the tight clip is still persisted; the
        # widen-source backfill (``python -m app.cli widen-source``) retries
        # later. Done AFTER the tight upload so an aborted ingest (network
        # blip during the tight upload) doesn't leave an orphan wide source
        # for a row that has no served clip.
        wide = await cut_and_upload_wide_source(
            local_video=local_video,
            video_id=video_id,
            chapter_start=float(chapter_start),
            chapter_end=float(chapter_end),
            source_key=pending_clip_source_key(video_id, chapter_start),
            log_prefix="clip_generator",
            lineup_id=lineup.id,
        )
        if wide.succeeded:
            assert wide.source_start_s is not None  # narrow for type checker
            trim_start_s, trim_end_s = tight_offsets_within_source(
                tight_start=clip_start,
                tight_duration=clip_duration,
                source_start=wide.source_start_s,
            )
            source_key: str | None = wide.source_key
        else:
            trim_start_s = trim_end_s = None
            source_key = None

        try:
            await lineup_repo.set_clip_url(
                db,
                lineup,
                clip_key,
                source_key=source_key,
                trim_start_s=trim_start_s,
                trim_end_s=trim_end_s,
            )
        except Exception as exc:
            # The objects are uploaded but the column did not commit. The
            # tight key is deterministic and the wide key is too (matches
            # ``pending_clip_source_key``), so a later backfill recomputes the
            # same keys and overwrites the same objects — no orphan, safe to
            # retry.
            logger.warning(
                "clip_generator: clip_url persist failed (object uploaded, "
                "column not committed; backfill is idempotent): lineup=%s "
                "key=%s error=%s",
                lineup.id, clip_key, str(exc),
            )
            return ClipGenerationResult(
                status="failed",
                error_codes=["clip_url_persist_failed"],
                reasoning=f"clip_url commit failed: {exc}",
                release_ts=release_ts,
                result_ts=result_ts,
                clip_start=clip_start,
                clip_duration=clip_duration,
            )

        logger.info(
            "clip_generator: clip generated: lineup=%s video_id=%s key=%s "
            "release_ts=%.2f result_ts=%.2f clip=[%.2f,+%.2fs] confidence=%.2f",
            lineup.id, video_id, clip_key, release_ts, result_ts,
            clip_start, clip_duration, timing.confidence or 0.0,
        )
        return ClipGenerationResult(
            status="generated",
            clip_key=clip_key,
            is_lineup_throw=True,
            confidence=timing.confidence,
            reasoning=timing.reasoning,
            release_ts=release_ts,
            result_ts=result_ts,
            clip_start=clip_start,
            clip_duration=clip_duration,
        )
    finally:
        # Only delete the video if THIS call downloaded it. During ingest the
        # orchestrator owns video_path and deletes it once after all chapters.
        if owns_video and local_video is not None:
            try:
                local_video.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "clip_generator: failed to delete re-fetched video: "
                    "path=%s error=%s",
                    local_video, str(exc),
                )
