"""Poster extractor — pull a single last-frame WebP still from a micro-clip.

Sibling to :mod:`frame_extractor` (same plain-subprocess ffmpeg pattern, no
extra dependency) but a distinct concern: frame_extractor pulls frames out of
the SOURCE video at arbitrary timestamps; this module pulls the LAST frame out
of an already-cut micro-clip's bytes (STAND / LANDING), producing a small
WebP poster so the frontend can render an instant still instead of paying for
a live-video element on first paint.

Usage::

    from app.services.ingestion.poster_extractor import extract_last_frame_webp

    poster_bytes = await extract_last_frame_webp(stand_clip_bytes)
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Default WebP quality — matches the "small, good enough" posture of the clip
# encode in frame_extractor._cut_clip_sync (crf 28 veryfast). 80 keeps a
# 720p-capped still well under the equivalent PNG size while staying visually
# clean for a card-view/pane poster.
_DEFAULT_WEBP_QUALITY = 80


class PosterExtractionError(Exception):
    """Raised when ffmpeg fails to extract a poster frame from clip bytes.

    Structured (returncode + stderr) per rules/check-third-party-error-codes.md
    — never a bare bool/None on failure. Mirrors
    :class:`app.services.ingestion.frame_extractor.FrameExtractionError`.

    Attributes:
        returncode: ffmpeg exit code (or -1 when output was empty).
        stderr: ffmpeg stderr output (the structured error message).
    """

    def __init__(self, message: str, *, returncode: int, stderr: str) -> None:
        super().__init__(message)
        self.returncode = returncode
        self.stderr = stderr


def _extract_last_frame_webp_sync(clip_bytes: bytes, quality: int) -> bytes:
    """Synchronously extract the last frame of *clip_bytes* as WebP.

    Writes *clip_bytes* to a temp ``.mp4`` file (ffmpeg needs a seekable
    input to compute ``-sseof``), then seeks to 0.1s before end-of-file and
    pulls a single frame, encoded as WebP straight to stdout via
    ``image2pipe`` — no intermediate file for the output (mirrors
    :func:`frame_extractor._extract_frame_sync`'s stdout-pipe shape).

    ``-sseof -0.1`` (rather than ``-sseof 0``) is deliberate: seeking to the
    exact end-of-file sometimes lands ffmpeg past the last decodable frame on
    a muted, fast-encoded (``veryfast``) clip, producing an empty output
    ("Output file is empty" — no frame at all, not a black frame). Empirically
    (see test_poster_extractor.py) an offset smaller than one frame interval
    (``-0.05`` at 30fps, ``-0.03`` always) is unreliable and can miss every
    frame; ``-0.1`` is comfortably larger than a frame interval at any
    realistic clip framerate (10-60fps) while still being negligible relative
    to a ~1-2s micro-clip.

    Raises :class:`PosterExtractionError` on non-zero exit or empty output —
    never a silent failure. The temp input file is always cleaned up.
    """
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(clip_bytes)
        in_path = Path(tmp.name)
    try:
        cmd = [
            "ffmpeg",
            "-sseof", "-0.1",
            "-i", str(in_path),
            "-frames:v", "1",
            "-c:v", "libwebp",
            "-q:v", str(quality),
            "-f", "image2pipe",
            "pipe:1",
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,  # single-frame extraction should never take this long
        )
        if result.returncode != 0:
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.warning(
                "ffmpeg poster extraction failed: returncode=%d stderr=%s",
                result.returncode, stderr_text,
            )
            raise PosterExtractionError(
                f"ffmpeg exited {result.returncode} extracting last-frame poster",
                returncode=result.returncode,
                stderr=stderr_text,
            )
        if not result.stdout:
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.warning(
                "ffmpeg poster extraction produced empty output: stderr=%s",
                stderr_text,
            )
            raise PosterExtractionError(
                "ffmpeg produced an empty poster frame",
                returncode=-1,
                stderr=stderr_text,
            )
        return result.stdout
    finally:
        in_path.unlink(missing_ok=True)


async def extract_last_frame_webp(
    clip_bytes: bytes,
    *,
    quality: int = _DEFAULT_WEBP_QUALITY,
) -> bytes:
    """Extract the last frame of *clip_bytes* as WebP bytes.

    Runs the blocking ffmpeg subprocess in the default thread-pool executor
    so it doesn't block the event loop (same shape as
    :func:`frame_extractor.cut_clip`). Raises :class:`PosterExtractionError`
    on any ffmpeg failure.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _extract_last_frame_webp_sync, clip_bytes, quality
    )


def pending_stand_poster_key(video_id: str, chapter_start: int) -> str:
    """Deterministic MinIO key for a lineup's STAND poster still.

    Same ``pending/{video_id}/{chapter_start}-{slot}`` shape as the ingestion
    screenshot keys (``_pending_screenshot_key`` in ingestion_orchestrator)
    and the micro-clip keys in :mod:`micro_clip_generator` — one key per
    (video, chapter start) keeps re-extraction idempotent (overwrites in
    place rather than orphaning a new object).
    """
    return f"pending/{video_id}/{int(chapter_start)}-stand-poster.webp"


def pending_landing_poster_key(video_id: str, chapter_start: int) -> str:
    """Deterministic MinIO key for a lineup's LANDING poster still.

    Sibling to :func:`pending_stand_poster_key` — identical shape, different
    suffix.
    """
    return f"pending/{video_id}/{int(chapter_start)}-landing-poster.webp"
