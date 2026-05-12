"""Unit tests for frame_extractor — ffmpeg subprocess is mocked.

Tests verify:
- extract_frames returns PNG bytes for each timestamp
- FrameExtractionError is raised on ffmpeg non-zero exit
- FrameExtractionError carries returncode and stderr
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.ingestion.frame_extractor import FrameExtractionError, extract_frames

_FAKE_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00"  # PNG magic bytes header


class TestExtractFrames:
    @pytest.mark.asyncio
    async def test_returns_bytes_for_each_timestamp(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_PNG

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            frames = await extract_frames(video, [5.0, 9.0])

        assert len(frames) == 2
        assert frames[0] == _FAKE_PNG
        assert frames[1] == _FAKE_PNG
        assert mock_run.call_count == 2

    @pytest.mark.asyncio
    async def test_ffmpeg_command_uses_correct_timestamp(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_PNG

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            await extract_frames(video, [12.5])

        cmd = mock_run.call_args[0][0]
        assert "-ss" in cmd
        ts_idx = cmd.index("-ss") + 1
        assert cmd[ts_idx] == "12.5"

    @pytest.mark.asyncio
    async def test_raises_frame_extraction_error_on_failure(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = b""
        mock_result.stderr = b"ffmpeg error: codec not found"

        with patch("subprocess.run", return_value=mock_result):
            with pytest.raises(FrameExtractionError) as exc_info:
                await extract_frames(video, [5.0])

        err = exc_info.value
        assert err.returncode == 1
        assert "codec not found" in err.stderr
        assert err.timestamp == 5.0

    @pytest.mark.asyncio
    async def test_empty_timestamps_returns_empty_list(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        with patch("subprocess.run") as mock_run:
            frames = await extract_frames(video, [])

        assert frames == []
        mock_run.assert_not_called()

    @pytest.mark.asyncio
    async def test_ffmpeg_output_piped_to_stdout(self, tmp_path: Path):
        """ffmpeg must write PNG to stdout (pipe:1) not to a file."""
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_PNG

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            await extract_frames(video, [1.0])

        cmd = mock_run.call_args[0][0]
        assert "pipe:1" in cmd
