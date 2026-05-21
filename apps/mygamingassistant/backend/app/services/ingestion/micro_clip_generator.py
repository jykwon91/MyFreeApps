"""Stand + Aim micro-clip generator — 1s looped clips for the STAND and AIM
panes of the 2×2 storyboard tile (PR6).

PR4 introduced the four-pane storyboard (STAND still | AIM still+anchor | THROW
clip | LANDING text). PR5 replaced the LANDING text with a real landing clip.
PR6 replaces the STAND and AIM stills with **1-second looping micro-clips**
anchored on the **same chapter timestamps** the Strategy-A classifier already
chose for ``stand_screenshot_url`` and ``aim_screenshot_url``. The still
remains the always-valid graceful degradation when no micro-clip exists.

Two entry paths share a single contract:

  1. **Ingest path** — orchestrator already ran the grid classifier and knows
     ``timestamps[stand_idx]`` / ``timestamps[aim_idx]``. It passes them via
     ``precomputed_stand_ts`` / ``precomputed_aim_ts``. The generator skips
     the classifier call entirely (cost saving: zero extra Claude spend) and
     just ffmpeg-cuts + uploads + commits.

  2. **Backfill path** — standalone CLI. ``precomputed_*_ts`` are None, so we
     re-run ``classify_frames_for_lineup_decision`` over the same grid the
     ingest path uses, recover the indices, and turn them back into
     timestamps via the deterministic ``grid_timestamps``. Cost: one grid-
     classifier call per lineup.

Why anchor on the **classifier-chosen** timestamps rather than fixed offsets
(chapter_start + 0 / chapter_start + 4): the first frame of the AIM clip IS
the existing aim still (same timestamp), so the persisted ``aim_anchor_x/y``
normalized overlay stays pixel-accurate when StandPane / AimPane swap from
``ScreenshotHalf`` to ``ClipView``. Fixed offsets would invalidate the anchor.

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
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)

# Frozen design-contract constants.
# 1-second micro-clip per pane — matches the operator's stated ideal of
# "at most each lineup should be 4 seconds total" with four 1s panes.
_MICRO_CLIP_SECONDS = 1.0
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
) -> Optional[tuple[float, float]]:
    """Return ``(clip_start, clip_duration)`` seconds, or None if too short.

    Starts AT the anchor timestamp (the classifier-chosen frame), runs
    forward for ``_MICRO_CLIP_SECONDS``, clamped to the chapter end. The
    important property is that ``clip_start == anchor_ts`` exactly — that
    is what keeps the AIM clip's first frame identical to the existing aim
    still, so the persisted ``aim_anchor_x/y`` overlay stays pixel-accurate.

    Returns None when the clamped duration is shorter than
    ``_MIN_CLIP_SECONDS`` (the anchor is too close to the chapter end to
    carry a meaningful clip). Caller skips with reason
    ``chapter_too_short_for_microclip``.
    """
    start = max(float(anchor_ts), float(chapter_start))
    end = min(start + _MICRO_CLIP_SECONDS, float(chapter_end))
    duration = end - start
    if duration < _MIN_CLIP_SECONDS:
        return None
    return start, duration


async def _resolve_anchor_timestamps_via_classifier(
    db: AsyncSession,
    lineup: Lineup,
    video_path: Path,
    chapter_start: float,
    chapter_end: float,
) -> tuple[Optional[float], Optional[float], list[str], str]:
    """Backfill helper: re-run the grid classifier to recover stand/aim ts.

    Returns ``(stand_ts, aim_ts, error_codes, reasoning)``. On any failure
    the timestamps are None and ``error_codes`` carries the structured
    reason. The caller then converts both sides to ``status="failed"`` /
    ``status="skipped"`` per the failure shape.
    """
    timestamps = grid_timestamps(
        float(chapter_start),
        float(chapter_end),
        _GRID_FRAME_COUNT,
        edge_padding_seconds=_GRID_EDGE_PADDING_SECONDS,
    )
    if not timestamps:
        return None, None, ["empty_grid_window"], "chapter window produced no grid frames"

    try:
        frames = await extract_frames(video_path, timestamps)
    except FrameExtractionError as exc:
        logger.warning(
            "micro_clip_generator: grid frame extraction failed: "
            "lineup=%s returncode=%s stderr=%s",
            lineup.id, exc.returncode, exc.stderr[:300],
        )
        return None, None, [f"frame_extract:rc={exc.returncode}"], str(exc)

    if not frames:
        return None, None, ["grid_frames_empty"], "ffmpeg returned no frames"

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
        return None, None, [f"classifier_raised:{type(exc).__name__}"], str(exc)

    if not result.success:
        logger.warning(
            "micro_clip_generator: grid classifier call failed: lineup=%s "
            "error_codes=%s",
            lineup.id, result.error_codes,
        )
        return None, None, list(result.error_codes), "grid classifier reported failure"

    if not result.is_lineup:
        # The backfill candidate is an accepted lineup, so the classifier
        # judging it "not a lineup" here would be a regression — keep the
        # signal but skip cleanly rather than fabricate timestamps.
        return None, None, [], "backfill grid says not_a_lineup (skip)"

    # 1-based → 0-based, clamped to the grid range. Falls back to
    # first/last index when the model omitted one — same shape as
    # ingestion_orchestrator's classifier-disabled fallback.
    stand_idx = (result.best_stand_index or 1) - 1
    aim_idx = (result.best_aim_index or len(frames)) - 1
    stand_idx = max(0, min(stand_idx, len(timestamps) - 1))
    aim_idx = max(0, min(aim_idx, len(timestamps) - 1))
    return timestamps[stand_idx], timestamps[aim_idx], [], result.reasoning or ""


async def generate_micro_clips_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    chapter_start: float,
    chapter_end: float,
    video_path: Optional[Path] = None,
    download_dir: Optional[Path] = None,
    precomputed_stand_ts: Optional[float] = None,
    precomputed_aim_ts: Optional[float] = None,
) -> MicroClipGenerationResult:
    """Cut + persist STAND and AIM 1s micro-clips for *lineup*.

    Two entry paths:

    **Ingest path** — caller (orchestrator) passes ``precomputed_stand_ts``
    AND ``precomputed_aim_ts`` from the grid classifier output it already
    has. The generator skips its own classifier call entirely. Cost: zero
    extra Claude spend; two extra ffmpeg cuts + two MinIO uploads per
    chapter.

    **Backfill path** — caller is the CLI; ``precomputed_*_ts`` are None.
    We re-run ``classify_frames_for_lineup_decision`` ourselves over the
    same grid the ingest path uses (cost: one Claude call per lineup),
    then cut both clips.

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
        precomputed_stand_ts / precomputed_aim_ts: Ingest path — pass the
            ``timestamps[stand_idx]`` / ``timestamps[aim_idx]`` the
            orchestrator already computed. Either both set or both None;
            mixed is a wiring bug.

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

    # Validate the precomputed pair — either both supplied or both None.
    if (precomputed_stand_ts is None) != (precomputed_aim_ts is None):
        logger.warning(
            "micro_clip_generator: lineup %s — precomputed_stand_ts / "
            "precomputed_aim_ts must both be set or both None; got "
            "stand=%s aim=%s",
            lineup.id, precomputed_stand_ts, precomputed_aim_ts,
        )
        return MicroClipGenerationResult(
            stand_status="failed",
            aim_status="failed",
            stand_error_codes=["precomputed_pair_mismatch"],
            aim_error_codes=["precomputed_pair_mismatch"],
            reasoning="precomputed stand/aim timestamps must be paired",
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
        if precomputed_stand_ts is not None:
            stand_ts = float(precomputed_stand_ts)
            aim_ts = float(precomputed_aim_ts)  # type: ignore[arg-type]
            reasoning = ""
        else:
            # Backfill path — re-run the grid classifier.
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

            (
                stand_ts,
                aim_ts,
                err_codes,
                reasoning,
            ) = await _resolve_anchor_timestamps_via_classifier(
                db, lineup, local_video, chapter_start, chapter_end,
            )
            if stand_ts is None or aim_ts is None:
                # Either real failure (err_codes set) or "not a lineup"
                # backfill regression (err_codes empty, skip cleanly).
                if err_codes:
                    return MicroClipGenerationResult(
                        stand_status="failed",
                        aim_status="failed",
                        stand_error_codes=list(err_codes),
                        aim_error_codes=list(err_codes),
                        reasoning=reasoning,
                    )
                return MicroClipGenerationResult(
                    stand_status="skipped",
                    aim_status="skipped",
                    stand_skip_reason="backfill_not_a_lineup",
                    aim_skip_reason="backfill_not_a_lineup",
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
    bounds = _compute_micro_bounds(anchor_ts, chapter_start, chapter_end)
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
