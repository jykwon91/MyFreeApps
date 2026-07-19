"""Unit tests for poster_extractor — the STAND/LANDING last-frame WebP still.

Two layers:
  - TestExtractLastFrameWebpMocked: ffmpeg subprocess mocked (same style as
    test_frame_extractor.py) — verifies command shape + structured error
    handling without depending on a real ffmpeg binary.
  - TestExtractLastFrameWebpIntegration: runs REAL ffmpeg against a tiny
    generated test clip and asserts the returned bytes carry a genuine
    RIFF/WEBP signature — a smoke test that the -sseof / libwebp pipeline
    actually produces a decodable image, not just "ffmpeg exited 0".
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.ingestion.poster_extractor import (
    PosterExtractionError,
    extract_last_frame_webp,
    pending_landing_poster_key,
    pending_stand_poster_key,
)

_FAKE_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "  # WebP container magic bytes


class TestExtractLastFrameWebpMocked:
    @pytest.mark.asyncio
    async def test_returns_webp_bytes_on_success(self):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_WEBP
        mock_result.stderr = b""

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            data = await extract_last_frame_webp(b"fake mp4 bytes")

        assert data == _FAKE_WEBP
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "ffmpeg"
        assert "-sseof" in cmd
        assert cmd[cmd.index("-sseof") + 1] == "-0.1"
        assert "libwebp" in cmd
        assert "pipe:1" in cmd

    @pytest.mark.asyncio
    async def test_quality_flag_is_passed_through(self):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_WEBP
        mock_result.stderr = b""

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            await extract_last_frame_webp(b"fake mp4 bytes", quality=42)

        cmd = mock_run.call_args[0][0]
        assert "-q:v" in cmd
        assert cmd[cmd.index("-q:v") + 1] == "42"

    @pytest.mark.asyncio
    async def test_raises_poster_extraction_error_on_nonzero_exit(self):
        bad = MagicMock()
        bad.returncode = 1
        bad.stdout = b""
        bad.stderr = b"ffmpeg: invalid data found when processing input"

        with patch("subprocess.run", return_value=bad):
            with pytest.raises(PosterExtractionError) as exc_info:
                await extract_last_frame_webp(b"garbage, not a real clip")

        err = exc_info.value
        assert err.returncode == 1
        assert "invalid data" in err.stderr

    @pytest.mark.asyncio
    async def test_raises_poster_extraction_error_on_empty_output(self):
        empty = MagicMock()
        empty.returncode = 0
        empty.stdout = b""
        empty.stderr = b""

        with patch("subprocess.run", return_value=empty):
            with pytest.raises(PosterExtractionError) as exc_info:
                await extract_last_frame_webp(b"fake mp4 bytes")

        assert exc_info.value.returncode == -1

    @pytest.mark.asyncio
    async def test_temp_input_file_cleaned_up(self):
        """No stray .mp4 temp files leak after a successful extraction."""
        import glob
        import tempfile

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_WEBP
        mock_result.stderr = b""

        before = set(glob.glob(str(Path(tempfile.gettempdir()) / "*.mp4")))
        with patch("subprocess.run", return_value=mock_result):
            await extract_last_frame_webp(b"fake mp4 bytes")
        after = set(glob.glob(str(Path(tempfile.gettempdir()) / "*.mp4")))

        assert after == before


class TestExtractLastFrameWebpIntegration:
    """Real ffmpeg — no mocks. Skipped if ffmpeg isn't on PATH."""

    @staticmethod
    def _ffmpeg_available() -> bool:
        try:
            subprocess.run(
                ["ffmpeg", "-version"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
            )
            return True
        except (FileNotFoundError, subprocess.SubprocessError):
            return False

    @staticmethod
    def _make_tiny_clip(tmp_path: Path) -> bytes:
        """Generate a 1s synthetic test clip via ffmpeg's lavfi source.

        30fps mirrors a realistic micro-clip framerate (real clips inherit
        the source video's fps via ``cut_clip`` — no explicit downsampling).
        A too-low framerate (e.g. 10fps) makes ``-sseof -0.1`` land less than
        one frame interval from EOF on a short clip, which can produce an
        empty extraction (see the offset-tuning note in poster_extractor's
        docstring) — 30fps + 1s avoids that edge entirely.
        """
        out = tmp_path / "tiny.mp4"
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=1.0:size=64x64:rate=30",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264", "-preset", "ultrafast",
            str(out),
        ]
        result = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
        )
        assert result.returncode == 0, result.stderr.decode(errors="replace")
        return out.read_bytes()

    @pytest.mark.asyncio
    async def test_extracts_real_last_frame_as_valid_webp(self, tmp_path: Path):
        if not self._ffmpeg_available():
            pytest.skip("ffmpeg not on PATH")

        clip_bytes = self._make_tiny_clip(tmp_path)
        assert clip_bytes  # sanity: the generated clip is non-empty

        poster_bytes = await extract_last_frame_webp(clip_bytes)

        assert poster_bytes
        assert poster_bytes[0:4] == b"RIFF"
        assert poster_bytes[8:12] == b"WEBP"

    @pytest.mark.asyncio
    async def test_raises_on_garbage_input(self):
        if not self._ffmpeg_available():
            pytest.skip("ffmpeg not on PATH")

        with pytest.raises(PosterExtractionError):
            await extract_last_frame_webp(b"this is not a video file at all")


class TestPosterKeys:
    def test_pending_stand_poster_key_shape(self):
        assert pending_stand_poster_key("abc123", 42) == \
            "pending/abc123/42-stand-poster.webp"

    def test_pending_landing_poster_key_shape(self):
        assert pending_landing_poster_key("abc123", 42) == \
            "pending/abc123/42-landing-poster.webp"

    def test_keys_coerce_float_chapter_start_to_int(self):
        # Mirrors micro_clip_generator.pending_stand_clip_key's int() coercion
        # — chapter_start is sometimes passed as a float from ORM columns.
        assert pending_stand_poster_key("vid", 42.9) == \
            "pending/vid/42-stand-poster.webp"
        assert pending_landing_poster_key("vid", 42.9) == \
            "pending/vid/42-landing-poster.webp"
