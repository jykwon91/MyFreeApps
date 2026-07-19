"""Poster generator — STAND + LANDING preview stills for a lineup.

Sits one layer above :mod:`poster_extractor` (the ffmpeg last-frame-WebP
primitive shipped in #984): it takes a lineup that already has its micro/landing
CLIPS uploaded and produces the two poster stills the glance board renders on
first paint —

  * STAND poster   = last frame of the STAND micro-clip → ``stand_screenshot_url``
  * LANDING poster = last frame of the LANDING clip     → ``landing_screenshot_url``

Both are derived purely from the already-uploaded clip objects — this module
never reads the source video, makes no Claude call, and needs no download beyond
two small clip objects. That makes it identical work whether it runs at ingest
(``chapter_media.generate_chapter_media``, right after the micro-clip step) or in
a standalone backfill (``poster_backfill.backfill_posters`` /
``python -m app.cli backfill-posters``) — one function, two callers, mirroring
the clip/landing/micro generator+backfill pairs.

Best-effort and per-side independent, exactly like the clip generators: a poster
failure must NEVER roll back the lineup or its sibling clip/screenshot columns.
Each side commits its own one-column write (``lineup_repo.set_stand_screenshot_url``
/ ``set_landing_screenshot_url``) and a failure on one side leaves the other
untouched. Per rules/check-third-party-error-codes.md every ffmpeg / storage
failure is captured with a structured reason and surfaced in ``error_codes`` —
never a silent ``return None``.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo
from app.services.ingestion.poster_extractor import (
    PosterExtractionError,
    extract_last_frame_webp,
    pending_landing_poster_key,
    pending_stand_poster_key,
)

logger = logging.getLogger(__name__)

# Poster stills are WebP (see poster_extractor); the bare object key is stored
# on the screenshot column and presigned at read time in lineup_service.
_POSTER_CONTENT_TYPE = "image/webp"


@dataclass
class PosterGenerationResult:
    """Outcome of generating a lineup's STAND + LANDING poster stills.

    The two sides are tallied independently — each is its own one-column commit
    and can succeed, skip, or fail without the other. ``status`` values match
    the clip generators: ``generated`` (poster written), ``skipped`` (no source
    clip / no video id — nothing to extract from, not an error), ``failed``
    (ffmpeg / storage error — ``error_codes`` carries the structured reason).
    """

    stand_status: str = "skipped"
    landing_status: str = "skipped"
    stand_key: Optional[str] = None
    landing_key: Optional[str] = None
    stand_error_codes: list[str] = field(default_factory=list)
    landing_error_codes: list[str] = field(default_factory=list)


async def _generate_one_poster(
    db: AsyncSession,
    lineup: Lineup,
    *,
    storage,
    clip_key: Optional[str],
    poster_key: str,
    persist,
    side: str,
) -> tuple[str, Optional[str], list[str]]:
    """Extract + upload + persist ONE side's poster. Returns (status, key, codes).

    ``clip_key`` is the bare object key of the already-uploaded source clip
    (STAND micro-clip or LANDING clip). ``persist`` is the one-column repo
    setter (``set_stand_screenshot_url`` / ``set_landing_screenshot_url``).
    Skips cleanly when the source clip is absent (a lineup can legitimately
    have one pane without the other); captures ffmpeg / storage faults as a
    structured code rather than raising.
    """
    if not clip_key:
        return "skipped", None, []

    loop = asyncio.get_running_loop()

    # Storage I/O is blocking (MinIO/R2 sync client) — offload to the executor
    # so the event loop stays free, same shape as micro_clip_helpers'
    # _cut_upload_persist_one_side.
    try:
        clip_bytes = await loop.run_in_executor(
            None, storage.download_file, clip_key
        )
    except Exception as exc:  # storage / network fault — structured, non-fatal
        logger.warning(
            "Poster %s: clip download failed lineup_id=%s clip_key=%s error=%s",
            side, lineup.id, clip_key, str(exc),
        )
        return "failed", None, [f"download-failed:{type(exc).__name__}"]

    try:
        poster_bytes = await extract_last_frame_webp(clip_bytes)
    except PosterExtractionError as exc:
        # ffmpeg returncode + stderr already logged inside the extractor.
        return "failed", None, [f"ffmpeg:{exc.returncode}"]

    try:
        await loop.run_in_executor(
            None, storage.upload_file, poster_key, poster_bytes,
            _POSTER_CONTENT_TYPE,
        )
    except Exception as exc:  # upload fault — structured, non-fatal
        logger.warning(
            "Poster %s: upload failed lineup_id=%s poster_key=%s error=%s",
            side, lineup.id, poster_key, str(exc),
        )
        return "failed", None, [f"upload-failed:{type(exc).__name__}"]

    # One-column commit lives in the repo (per PR #687/#695) — never here.
    await persist(db, lineup, poster_key)
    return "generated", poster_key, []


async def generate_posters_for_lineup(
    db: AsyncSession,
    lineup: Lineup,
    *,
    storage=None,
) -> PosterGenerationResult:
    """Generate STAND + LANDING poster stills for one accepted lineup.

    Reads the lineup's already-uploaded ``stand_clip_url`` / ``landing_clip_url``,
    pulls the last frame of each as a WebP (see :mod:`poster_extractor`), uploads
    it under the deterministic poster key, and persists the key onto the matching
    screenshot column. Idempotent: the poster key is a pure function of
    ``(video_id, chapter_start)`` so a re-run overwrites in place rather than
    orphaning a new object.

    Requires ``youtube_video_id`` (the poster key is keyed on it, same as the
    clip keys). A manual-upload lineup with no source video is skipped on both
    sides. Never raises for an expected fault — each side returns
    ``generated`` / ``skipped`` / ``failed`` in the result.
    """
    result = PosterGenerationResult()

    video_id = lineup.youtube_video_id
    if not video_id or lineup.chapter_start_seconds is None:
        # No source-video coordinates to key the poster on — nothing to do.
        return result

    storage = storage or get_storage()
    start = int(lineup.chapter_start_seconds)

    (
        result.stand_status,
        result.stand_key,
        result.stand_error_codes,
    ) = await _generate_one_poster(
        db,
        lineup,
        storage=storage,
        clip_key=lineup.stand_clip_url,
        poster_key=pending_stand_poster_key(video_id, start),
        persist=lineup_repo.set_stand_screenshot_url,
        side="stand",
    )

    (
        result.landing_status,
        result.landing_key,
        result.landing_error_codes,
    ) = await _generate_one_poster(
        db,
        lineup,
        storage=storage,
        clip_key=lineup.landing_clip_url,
        poster_key=pending_landing_poster_key(video_id, start),
        persist=lineup_repo.set_landing_screenshot_url,
        side="landing",
    )

    return result
