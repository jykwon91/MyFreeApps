"""Frame extractor — pull PNG frames from a video file using ffmpeg subprocess.

Uses plain subprocess (not a Python wrapper) so there's no extra dependency.
ffmpeg must be installed in the runtime image (added to backend.Dockerfile PR 4).

Usage::

    from app.services.ingestion.frame_extractor import extract_frames
    from pathlib import Path

    frames = await extract_frames(Path("/tmp/mga-ingestion/abc123.mp4"), [10.0, 14.0])
    # frames[0] is PNG bytes for t=10s, frames[1] for t=14s
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


class FrameExtractionError(Exception):
    """Raised when ffmpeg fails to extract a frame.

    Attributes:
        timestamp: The timestamp (seconds) that failed.
        returncode: ffmpeg exit code.
        stderr: ffmpeg stderr output (contains the structured error message).
    """
    def __init__(
        self,
        message: str,
        *,
        timestamp: float,
        returncode: int,
        stderr: str,
    ) -> None:
        super().__init__(message)
        self.timestamp = timestamp
        self.returncode = returncode
        self.stderr = stderr


def _extract_frame_sync(video_path: Path, timestamp: float) -> bytes:
    """Synchronously extract one PNG frame at *timestamp* seconds.

    Spawns ffmpeg as a subprocess and reads PNG bytes from stdout.
    Raises FrameExtractionError on non-zero exit code.
    """
    cmd = [
        "ffmpeg",
        "-ss", str(timestamp),
        "-i", str(video_path),
        "-frames:v", "1",
        "-f", "image2pipe",
        "-vcodec", "png",
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
        logger.error(
            "ffmpeg frame extraction failed: video=%s timestamp=%.1f returncode=%d stderr=%s",
            video_path, timestamp, result.returncode, stderr_text,
        )
        raise FrameExtractionError(
            f"ffmpeg exited {result.returncode} extracting t={timestamp:.1f}s from {video_path.name}",
            timestamp=timestamp,
            returncode=result.returncode,
            stderr=stderr_text,
        )
    return result.stdout


async def extract_frames(
    video_path: Path,
    timestamps: list[float],
) -> list[bytes]:
    """Extract PNG frames at each timestamp from *video_path*.

    Frames are extracted sequentially (one ffmpeg call per timestamp) in a
    thread pool executor so they don't block the event loop.

    Returns a list of PNG byte strings in the same order as *timestamps*.
    Raises FrameExtractionError on any individual failure.
    """
    loop = asyncio.get_event_loop()
    results: list[bytes] = []
    for ts in timestamps:
        png_bytes = await loop.run_in_executor(
            None, _extract_frame_sync, video_path, ts
        )
        results.append(png_bytes)
    return results
