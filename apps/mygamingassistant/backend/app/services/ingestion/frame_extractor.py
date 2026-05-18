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
import tempfile
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


def grid_timestamps(
    start_seconds: float,
    end_seconds: float,
    n: int,
    *,
    edge_padding_seconds: float = 0.5,
) -> list[float]:
    """Compute *n* evenly-spaced timestamps strictly inside (start, end).

    Strategy A's frame grid. The exact chapter boundaries are the worst
    possible sample points (deterministic fade-in / title-card / transition /
    black frame), so the grid is placed strictly *inside* the chapter with a
    small padding pulled off each edge, then *n* points spaced evenly across
    the padded interior. The boundaries themselves are never sampled.

    For ``n=5`` over a chapter ``(20, 200)`` with default padding the result is
    five points evenly spread across ``[20.5, 199.5]`` — i.e. ``20.5``,
    ``70.25``, ``120.0``, ``169.75``, ``199.5``.

    Args:
        start_seconds: Chapter start (exclusive — never sampled).
        end_seconds: Chapter end (exclusive — never sampled).
        n: Number of frames to sample (>= 1). Clamped to >= 1.
        edge_padding_seconds: Seconds pulled off each edge before spacing.
            On very short chapters the padded interior can collapse; the
            timestamps then degenerate toward the chapter midpoint, which is
            still strictly inside (start, end).

    Returns:
        A list of *n* monotonically non-decreasing float timestamps, each
        strictly within the open interval ``(start_seconds, end_seconds)``.
        Order matches the natural start→end progression so callers can treat
        earlier indices as "earlier in the chapter".
    """
    count = max(1, int(n))
    span_lo = float(start_seconds)
    span_hi = float(end_seconds)

    # Degenerate / inverted chapter — collapse everything to a safe interior
    # point. Strictly-inside is impossible if hi <= lo, so just nudge off lo.
    if span_hi <= span_lo:
        return [span_lo + 0.001] * count

    midpoint = (span_lo + span_hi) / 2.0
    lo = span_lo + edge_padding_seconds
    hi = span_hi - edge_padding_seconds

    # Padding ate the whole interval (chapter shorter than 2*padding) — fall
    # back to the midpoint, which is guaranteed strictly inside (lo, hi).
    if hi <= lo:
        return [midpoint] * count

    if count == 1:
        return [midpoint]

    step = (hi - lo) / (count - 1)
    return [lo + step * i for i in range(count)]


# ---------------------------------------------------------------------------
# Clip pipeline (PR2) — downscaled dense-window frames + ffmpeg clip cut.
#
# These exist alongside the Strategy-A grid path (extract_frames /
# grid_timestamps) and deliberately DO NOT touch it: the classification grid
# needs full-resolution frames for aim-anchor pixel work, whereas the
# throw-timing pass only needs to *order* the throw in time, so its frames are
# downscaled to keep the N=12 dense window at roughly the same image-token cost
# as the old N=5 full-res grid.
# ---------------------------------------------------------------------------

# Downscale target for the throw-timing classifier frames. 640x360 keeps a
# 12-frame dense window ≈ the token cost of the old 5-frame full-res grid
# (~$0.016/haiku call). Do NOT raise without re-checking the per-call cost note
# in the PR — token cost scales with pixel area.
_DOWNSCALE_W = 640
_DOWNSCALE_H = 360


class ClipCutError(Exception):
    """Raised when ffmpeg fails to cut/encode a clip segment.

    Mirrors :class:`FrameExtractionError` (a clip cut is a distinct ffmpeg op,
    so it carries its own structured failure context per
    rules/check-third-party-error-codes.md — never a bare bool/None).

    Attributes:
        start: Clip start (seconds) that failed.
        duration: Requested clip duration (seconds).
        returncode: ffmpeg exit code (or -1 when output was empty).
        stderr: ffmpeg stderr output (the structured error message).
    """

    def __init__(
        self,
        message: str,
        *,
        start: float,
        duration: float,
        returncode: int,
        stderr: str,
    ) -> None:
        super().__init__(message)
        self.start = start
        self.duration = duration
        self.returncode = returncode
        self.stderr = stderr


def _extract_frame_downscaled_sync(video_path: Path, timestamp: float) -> bytes:
    """Synchronously extract one PNG frame at *timestamp*, downscaled.

    Identical to :func:`_extract_frame_sync` but adds an ffmpeg ``scale``
    filter so the throw-timing classifier gets cheap, small frames. The
    full-res :func:`_extract_frame_sync` is intentionally left untouched —
    the classification grid still needs full pixels for aim-anchor work.
    """
    cmd = [
        "ffmpeg",
        "-ss", str(timestamp),
        "-i", str(video_path),
        "-frames:v", "1",
        "-vf", f"scale={_DOWNSCALE_W}:{_DOWNSCALE_H}",
        "-f", "image2pipe",
        "-vcodec", "png",
        "pipe:1",
    ]
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
    )
    if result.returncode != 0:
        stderr_text = result.stderr.decode("utf-8", errors="replace")
        logger.error(
            "ffmpeg downscaled frame extraction failed: video=%s timestamp=%.1f "
            "returncode=%d stderr=%s",
            video_path, timestamp, result.returncode, stderr_text,
        )
        raise FrameExtractionError(
            f"ffmpeg exited {result.returncode} extracting downscaled "
            f"t={timestamp:.1f}s from {video_path.name}",
            timestamp=timestamp,
            returncode=result.returncode,
            stderr=stderr_text,
        )
    return result.stdout


async def extract_frames_downscaled(
    video_path: Path,
    timestamps: list[float],
) -> list[bytes]:
    """Extract downscaled (640x360) PNG frames at each timestamp.

    The throw-timing classifier only needs to *order* the throw within the
    chapter, not read crosshair pixels, so its frames are downscaled. This
    keeps the N=12 dense window at roughly the image-token cost of the old
    N=5 full-res classification grid.

    Same sequential thread-pool shape as :func:`extract_frames`. Raises
    :class:`FrameExtractionError` on any individual ffmpeg failure.
    """
    loop = asyncio.get_event_loop()
    results: list[bytes] = []
    for ts in timestamps:
        png_bytes = await loop.run_in_executor(
            None, _extract_frame_downscaled_sync, video_path, ts
        )
        results.append(png_bytes)
    return results


def clip_window_timestamps(
    chapter_start_seconds: float,
    chapter_end_seconds: float,
) -> list[float]:
    """Dense single-pass sample window for throw-timing detection (PR2).

    NOT the Strategy-A classification grid (:func:`grid_timestamps`). That one
    samples the *whole* chapter sparsely to pick a stand/aim still. This one
    trims the walk-in/explanation lead-in and densely samples the part of the
    chapter where the throw actually happens, so the throw-timing classifier
    can localise release/result frames.

    Per the frozen design contract (pr2-clip-localization-design.md):

      - ``duration = end - start``
      - ``skip_fraction = 0.30 if duration >= 20 else 0.15`` — drop the
        walk-in / "here's the spot" explanation lead-in.
      - ``window = [start + duration*skip_fraction, end]``
      - ``N = 12`` evenly across the window, edge_padding 0.5s, EXCEPT:
        - remaining window < 12s after the skip → ``N = 8`` over that window
        - chapter longer than 180s → cap the window to the final 120s before
          the chapter end (a long chapter's throw is near the end), keep N=12.

    Returns the list of frame timestamps. Index ``i`` (1-based in the
    classifier's schema) maps to ``result[i-1]`` — the caller turns the
    classifier's release/result indices back into timestamps via this list,
    so it MUST be the exact list the frames were extracted from.
    """
    start = float(chapter_start_seconds)
    end = float(chapter_end_seconds)
    duration = end - start

    skip_fraction = 0.30 if duration >= 20 else 0.15
    window_start = start + duration * skip_fraction
    window_end = end

    if duration > 180:
        # A long chapter's actual throw is near the end (the front is a long
        # walk-through / explanation). Cap to the final 120s so the dense
        # window isn't wasted on lead-in. max() guards the degenerate case
        # where the skip already pushed past end-120.
        window_start = max(window_start, end - 120.0)
        n = 12
    elif (window_end - window_start) < 12:
        # Short remaining window — fewer frames is plenty and keeps token
        # cost down; cover the whole remaining window.
        n = 8
    else:
        n = 12

    return grid_timestamps(
        window_start, window_end, n, edge_padding_seconds=0.5
    )


def _cut_clip_sync(
    video_path: Path,
    start_seconds: float,
    duration_seconds: float,
) -> bytes:
    """Synchronously cut a muted, web-playable MP4 segment via ffmpeg.

    ``-ss`` is placed BEFORE ``-i`` for fast input seeking (same trade-off as
    :func:`_extract_frame_sync`): keyframe-accurate rather than exact, which is
    correct for a gif-style autoplay clip and avoids decoding the whole video.

    Encode choices (frozen design contract):
      - ``-an`` — muted (the tile autoplays; audio would be a UX bug).
      - ``libx264 -crf 28 -preset veryfast`` — small, fast, "good enough".
      - ``-vf scale=-2:'min(720,ih)'`` — cap at 720p, never upscale, keep even
        width (libx264 requires even dimensions).
      - ``-pix_fmt yuv420p`` — REQUIRED for ``<video>`` playback across
        browsers; libx264 may otherwise pick yuv444p which Safari/Firefox
        refuse to decode.
      - ``-movflags +faststart`` — moves the moov atom to the front so the
        clip starts playing before it's fully buffered. This needs a seekable
        output, so we write to a temp file and read it back (you cannot
        +faststart to a pipe).

    Raises :class:`ClipCutError` (structured: returncode + stderr) on a
    non-zero exit or an empty/missing output file — never a silent failure.
    """
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        out_path = Path(tmp.name)
    try:
        cmd = [
            "ffmpeg",
            "-ss", f"{start_seconds:.3f}",
            "-i", str(video_path),
            "-t", f"{duration_seconds:.3f}",
            "-an",
            "-c:v", "libx264",
            "-crf", "28",
            "-preset", "veryfast",
            "-vf", "scale=-2:'min(720,ih)'",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-f", "mp4",
            "-y",
            str(out_path),
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=180,  # input-seek keeps this fast; generous for big sources
        )
        if result.returncode != 0:
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.error(
                "ffmpeg clip cut failed: video=%s start=%.2f dur=%.2f "
                "returncode=%d stderr=%s",
                video_path, start_seconds, duration_seconds,
                result.returncode, stderr_text,
            )
            raise ClipCutError(
                f"ffmpeg exited {result.returncode} cutting clip "
                f"[{start_seconds:.2f}, +{duration_seconds:.2f}s] from "
                f"{video_path.name}",
                start=start_seconds,
                duration=duration_seconds,
                returncode=result.returncode,
                stderr=stderr_text,
            )
        data = out_path.read_bytes()
        if not data:
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.error(
                "ffmpeg clip cut produced empty output: video=%s start=%.2f "
                "dur=%.2f stderr=%s",
                video_path, start_seconds, duration_seconds, stderr_text,
            )
            raise ClipCutError(
                f"ffmpeg produced an empty clip from {video_path.name}",
                start=start_seconds,
                duration=duration_seconds,
                returncode=-1,
                stderr=stderr_text,
            )
        return data
    finally:
        out_path.unlink(missing_ok=True)


async def cut_clip(
    video_path: Path,
    start_seconds: float,
    duration_seconds: float,
) -> bytes:
    """Cut a muted, web-playable MP4 segment and return its bytes.

    Runs the blocking ffmpeg subprocess in the default thread-pool executor so
    it doesn't block the event loop (same shape as :func:`extract_frames`).
    Raises :class:`ClipCutError` on any ffmpeg failure.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _cut_clip_sync, video_path, start_seconds, duration_seconds
    )
