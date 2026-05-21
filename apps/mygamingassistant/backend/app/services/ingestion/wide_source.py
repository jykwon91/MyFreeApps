"""Shared cut+upload of the wider trim-editor source clip.

Three callers need the same shape: (1) the throw-clip ingest path
(:mod:`clip_generator`), (2) the landing-clip ingest path
(:mod:`landing_clip_generator`), and (3) the standalone widen-source
backfill (:mod:`widen_source_backfill`). All of them download or reuse the
source video, then cut a wider clip covering ``[chapter_start - PRE_S,
chapter_end + POST_S]`` (clamped at 0 — ffmpeg silently truncates past the
real video end so we don't need the duration up front) and upload it under
a deterministic key the trim editor reads via ``*_url_original``.

Best-effort by contract: failure here NEVER blocks the surrounding pipeline.
The ingest paths persist the legacy posture (``*_url_original = *_url``,
NULL offsets) on wide failure; the widen-source backfill records the
failure in its stats and continues to the next row. Mirrors the same
"orthogonal to lineup validity" failure shape :func:`set_clip_url` and
:func:`set_landing_clip_url` document at the repo layer.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.core.storage import get_storage
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    cut_clip,
    wide_source_bounds,
)

logger = logging.getLogger(__name__)


@dataclass
class WideSourceResult:
    """Outcome of a wide-source cut+upload.

    On success ``source_key`` is the uploaded bare MinIO key (set into
    ``*_url_original`` by the caller) and ``source_start_s`` /
    ``source_duration_s`` are the bounds the wider clip was cut from in the
    SOURCE VIDEO timeline (the caller needs ``source_start_s`` to compute
    the tight clip's offset inside the wider source for the trim editor).

    On failure all fields are ``None`` and ``error_codes`` carries the
    structured ffmpeg/MinIO failure reason. The widen-source backfill
    tallies these; the ingest paths log and fall back to the legacy posture
    so the tight clip is still persisted.
    """

    source_key: Optional[str] = None
    source_start_s: Optional[float] = None
    source_duration_s: Optional[float] = None
    error_codes: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.error_codes is None:
            self.error_codes = []

    @property
    def succeeded(self) -> bool:
        return self.source_key is not None


async def cut_and_upload_wide_source(
    *,
    local_video: Path,
    video_id: str,
    chapter_start: float,
    chapter_end: float,
    source_key: str,
    log_prefix: str,
    lineup_id: uuid.UUID,
) -> WideSourceResult:
    """Cut a wider clip from *local_video* and upload it under *source_key*.

    Args:
        local_video: Already-downloaded source video on disk. The caller
            owns its lifecycle (ingest reuses the orchestrator's download;
            backfill manages its own one-per-video download).
        video_id: YouTube id, for logging context only.
        chapter_start / chapter_end: Chapter bounds (seconds). The wider
            clip spans ``[chapter_start - settings.clip_source_pre_seconds,
            chapter_end + settings.clip_source_post_seconds]`` clamped at 0.
        source_key: Where to upload the wider clip (caller supplies via
            ``pending_clip_source_key`` or ``pending_landing_clip_source_key``
            so the key naming is owned by each pane's generator module).
        log_prefix: Subsystem name to prefix WARNING logs (e.g.
            ``"clip_generator"``, ``"widen-source-backfill"``).
        lineup_id: The row this clip belongs to, for log correlation.

    Returns:
        :class:`WideSourceResult`. Never raises for an expected failure;
        ffmpeg / MinIO errors are captured into ``error_codes``.
    """
    source_start, source_duration = wide_source_bounds(
        chapter_start, chapter_end,
        pre_seconds=settings.clip_source_pre_seconds,
        post_seconds=settings.clip_source_post_seconds,
    )

    try:
        source_bytes = await cut_clip(local_video, source_start, source_duration)
    except ClipCutError as exc:
        logger.warning(
            "%s: wide source cut failed (best-effort; tight clip / "
            "existing source unchanged): lineup=%s video_id=%s start=%.2f "
            "duration=%.2f returncode=%s stderr=%s",
            log_prefix, lineup_id, video_id, source_start, source_duration,
            exc.returncode, exc.stderr[:300],
        )
        return WideSourceResult(
            error_codes=[f"wide_source_cut:rc={exc.returncode}"],
        )

    try:
        storage = get_storage()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, storage.upload_file, source_key, source_bytes, "video/mp4",
        )
    except Exception as exc:  # noqa: BLE001 — MinIO/network errors are diverse
        logger.warning(
            "%s: wide source upload failed (best-effort; tight clip / "
            "existing source unchanged): lineup=%s key=%s error=%s",
            log_prefix, lineup_id, source_key, str(exc),
        )
        return WideSourceResult(error_codes=["wide_source_upload_failed"])

    return WideSourceResult(
        source_key=source_key,
        source_start_s=source_start,
        source_duration_s=source_duration,
    )


def tight_offsets_within_source(
    *,
    tight_start: float,
    tight_duration: float,
    source_start: float,
) -> tuple[float, float]:
    """Offsets the tight clip occupies inside the wider source, in source-
    timeline seconds.

    The trim editor's slider opens at ``[trim_start_s, trim_end_s]`` inside
    the wider ``*_url_original``. After ingest those bounds match the tight
    served clip so the slider opens already-trimmed to what the operator
    sees on the glance board; the operator can drag wider (into the padding)
    or narrower from there. Returns ``(trim_start_s, trim_end_s)``.
    """
    trim_start_s = tight_start - source_start
    trim_end_s = tight_start + tight_duration - source_start
    return trim_start_s, trim_end_s
