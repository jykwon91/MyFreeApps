"""Throw-technique extractor — name HOW a lineup's throw is executed.

A lineup's footer should tell the player not just *what* lands where (the
clip) but *how* to throw it: "Jumpthrow + LMB", "E + 2-charge + 1-bounce".
This service localises the throw window in the source chapter (the SAME
``clip_window_timestamps`` window the PR2 clip pipeline uses), asks Claude to
name the technique, and persists the compact phrase on the row for the
glance-board footer (PR3).

Decoupled from the clip pipeline by design (frozen contract
pr3-throw-technique-design.md):

  - Own Claude call (``classify_throw_technique_from_frames``) with its own
    prompt/schema — NOT folded into the PR2 timing call, so technique is still
    produced for lineups whose clip was gated off (low timing confidence / no
    release frame).
  - Own ``set_technique`` one-column commit — a technique failure never rolls
    back the committed lineup / clip; the lineup stays fully usable without a
    technique.
  - Extracts its own frames over the same window rather than threading shared
    frame bytes through PR2's shipped ``clip_generator`` / ``_process_chapter``
    (documented contract deviation: that refactor would add regression risk to
    well-tested shipped code to save one cheap *local* downscaled ffmpeg pass
    on a background path that already downloads whole videos — under the MGA
    casual-app posture the independent extraction is the better tradeoff).

Failure handling (rules/no-bandaid-solutions.md +
rules/check-third-party-error-codes.md): yt-dlp / ffmpeg / Claude failures are
captured with their structured codes, logged at WARNING with the reason, and
returned as ``status="failed"`` with ``error_codes``. ``technique`` is left
NULL and the lineup stays fully usable. Nothing silent-fails.
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
from app.services.classification.classifier_service import (
    classify_throw_technique_from_frames,
)
from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    clip_window_timestamps,
    extract_frames_downscaled,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    download_video,
)

logger = logging.getLogger(__name__)


@dataclass
class TechniqueGenerationResult:
    """Structured outcome of a technique-extraction attempt.

    ``status`` is one of:
      - ``"generated"`` — technique named, ``technique`` committed.
        ``technique`` is set.
      - ``"skipped"``   — deliberately no technique (no source video / not a
        throw / motion not visible / below the 0.55 confidence gate /
        classifier disabled / chapter too short). NOT an error; the lineup is
        fully usable without a technique footer.
      - ``"failed"``    — an operational failure (download / extract / Claude
        API / persist). ``error_codes`` carries the structured reason;
        ``technique`` is left NULL; a later backfill run retries.

    Never a bare bool/None — the caller and the backfill summary route on this
    (per rules/check-third-party-error-codes.md).
    """

    status: str
    technique: Optional[str] = None
    skip_reason: Optional[str] = None
    error_codes: list[str] = field(default_factory=list)
    reasoning: str = ""
    confidence: Optional[float] = None


async def extract_technique_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    chapter_start: float,
    chapter_end: float,
    game_slug: Optional[str] = None,
    video_path: Optional[Path] = None,
    download_dir: Optional[Path] = None,
) -> TechniqueGenerationResult:
    """Name *lineup*'s throw technique and persist ``technique``.

    Args:
        db: Active async session. On success the phrase is committed via
            ``lineup_repo.set_technique`` (its own one-column commit — a
            technique failure must not roll back the already-committed lineup
            or clip).
        lineup: The row. ``youtube_video_id`` must be set (manual uploads have
            no source video — caller must not call this for them).
        chapter_start / chapter_end: Source chapter bounds in seconds. Ingest
            passes the parsed ``Chapter``; backfill re-derives the end from the
            re-fetched video metadata.
        game_slug: ``"cs2"`` / ``"valorant"`` — selects the technique
            vocabulary. None → the prompt determines the game from the HUD.
        video_path: An already-downloaded source video to reuse (ingest). When
            None the video is re-fetched by ``youtube_video_id`` (backfill)
            into *download_dir* and deleted afterwards.
        download_dir: Required when *video_path* is None — where to download
            the re-fetched source.

    Returns:
        TechniqueGenerationResult — see its docstring for ``status``
        semantics. Never raises for an expected failure; everything is
        captured into the result with structured ``error_codes`` and a
        WARNING log.
    """
    video_id = lineup.youtube_video_id
    if not video_id:
        # The caller is responsible for not calling this on manual uploads
        # (no source video → technique is not extractable, by input modality);
        # surface it loudly rather than silently no-op.
        logger.warning(
            "technique_extractor: lineup %s has no youtube_video_id — cannot "
            "extract technique",
            lineup.id,
        )
        return TechniqueGenerationResult(
            status="skipped",
            skip_reason="no_source_video",
        )

    # Cheap exits before any download / Claude spend. With no key (or the
    # classifier disabled) we cannot judge the technique — keep technique NULL.
    if not settings.enable_classifier:
        return TechniqueGenerationResult(
            status="skipped", skip_reason="classifier_disabled"
        )
    if not settings.anthropic_api_key:
        return TechniqueGenerationResult(
            status="skipped",
            skip_reason="classifier_unavailable:missing_api_key",
        )

    chapter_duration = float(chapter_end) - float(chapter_start)
    timestamps = clip_window_timestamps(chapter_start, chapter_end)
    if not timestamps:
        return TechniqueGenerationResult(
            status="skipped", skip_reason="empty_clip_window"
        )

    owns_video = video_path is None
    local_video: Optional[Path] = video_path
    try:
        # ---- Acquire the source video (only needed to extract frames) ---
        if local_video is None:
            if download_dir is None:
                logger.warning(
                    "technique_extractor: lineup %s — no video_path and no "
                    "download_dir; cannot re-fetch source",
                    lineup.id,
                )
                return TechniqueGenerationResult(
                    status="failed",
                    error_codes=["no_download_dir"],
                    reasoning="Re-fetch requested but no download_dir provided",
                )
            try:
                local_video = await download_video(video_id, download_dir)
            except VideoDownloadError as exc:
                logger.warning(
                    "technique_extractor: source re-fetch failed: lineup=%s "
                    "video_id=%s error_type=%s message=%s",
                    lineup.id, video_id, exc.error_type, str(exc),
                )
                return TechniqueGenerationResult(
                    status="failed",
                    error_codes=[f"download:{exc.error_type}"],
                    reasoning=f"Video re-fetch failed: {exc}",
                )

        # ---- Dense downscaled frames over the throw window -------------
        try:
            frames = await extract_frames_downscaled(local_video, timestamps)
        except FrameExtractionError as exc:
            logger.warning(
                "technique_extractor: downscaled frame extraction failed: "
                "lineup=%s video_id=%s returncode=%s stderr=%s",
                lineup.id, video_id, exc.returncode, exc.stderr[:300],
            )
            return TechniqueGenerationResult(
                status="failed",
                error_codes=[f"frame_extract:rc={exc.returncode}"],
                reasoning=f"Downscaled frame extraction failed: {exc}",
            )

        # ---- Name the technique ----------------------------------------
        result = await classify_throw_technique_from_frames(
            frames=frames,
            frame_timestamps=timestamps,
            chapter_title=lineup.chapter_title,
            chapter_duration=chapter_duration,
            game_slug=game_slug,
        )
        if not result.success:
            logger.warning(
                "technique_extractor: technique call failed: lineup=%s "
                "video_id=%s error_codes=%s reasoning=%s",
                lineup.id, video_id, result.error_codes, result.reasoning,
            )
            return TechniqueGenerationResult(
                status="failed",
                error_codes=list(result.error_codes),
                reasoning=result.reasoning,
            )

        # A null technique is a valid "cannot determine" answer (not-a-throw /
        # motion not visible / gated below 0.55) — keep technique NULL; the
        # footer simply shows nothing. The structured gate code (if any) rides
        # error_codes for operator visibility, not as a failure.
        if result.technique is None:
            return TechniqueGenerationResult(
                status="skipped",
                skip_reason="no_technique",
                error_codes=list(result.error_codes),
                confidence=result.confidence,
                reasoning=result.reasoning,
            )

        try:
            await lineup_repo.set_technique(db, lineup, result.technique)
        except Exception as exc:
            logger.warning(
                "technique_extractor: technique persist failed (column not "
                "committed; backfill is idempotent): lineup=%s technique=%r "
                "error=%s",
                lineup.id, result.technique, str(exc),
            )
            return TechniqueGenerationResult(
                status="failed",
                error_codes=["technique_persist_failed"],
                reasoning=f"technique commit failed: {exc}",
                confidence=result.confidence,
            )

        logger.info(
            "technique_extractor: technique set: lineup=%s video_id=%s "
            "technique=%r confidence=%.2f",
            lineup.id, video_id, result.technique, result.confidence or 0.0,
        )
        return TechniqueGenerationResult(
            status="generated",
            technique=result.technique,
            confidence=result.confidence,
            reasoning=result.reasoning,
        )
    finally:
        # Only delete the video if THIS call downloaded it. During ingest the
        # orchestrator owns video_path and deletes it once after all chapters.
        if owns_video and local_video is not None:
            try:
                local_video.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "technique_extractor: failed to delete re-fetched video: "
                    "path=%s error=%s",
                    local_video, str(exc),
                )
