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

from app.services.ingestion.frame_extractor import (
    FrameExtractionError,
    extract_frames,
    grid_timestamps,
)

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


class TestGridTimestamps:
    def test_n_evenly_spaced_strictly_inside(self):
        ts = grid_timestamps(20.0, 200.0, 5, edge_padding_seconds=0.5)
        assert len(ts) == 5
        # Strictly inside the open interval (20, 200).
        assert all(20.0 < t < 200.0 for t in ts)
        # First/last pulled in by the edge padding; never the boundary.
        assert ts[0] == pytest.approx(20.5)
        assert ts[-1] == pytest.approx(199.5)
        # Evenly spaced + monotonic.
        diffs = [ts[i + 1] - ts[i] for i in range(len(ts) - 1)]
        assert all(d == pytest.approx(diffs[0]) for d in diffs)
        assert ts == sorted(ts)

    def test_boundaries_never_sampled(self):
        ts = grid_timestamps(0.0, 90.0, 5)
        assert 0.0 not in ts
        assert 90.0 not in ts
        assert all(0.0 < t < 90.0 for t in ts)

    def test_single_frame_returns_midpoint(self):
        ts = grid_timestamps(10.0, 50.0, 1)
        assert ts == [pytest.approx(30.0)]

    def test_short_chapter_collapses_to_midpoint(self):
        # Padding (0.5*2=1.0) exceeds the 0.4s chapter — degenerate to the
        # midpoint, still strictly inside (10.0, 10.4).
        ts = grid_timestamps(10.0, 10.4, 5, edge_padding_seconds=0.5)
        assert len(ts) == 5
        assert all(t == pytest.approx(10.2) for t in ts)
        assert all(10.0 < t < 10.4 for t in ts)

    def test_inverted_chapter_is_safe(self):
        # end <= start must not crash and must stay near start.
        ts = grid_timestamps(50.0, 50.0, 3)
        assert len(ts) == 3
        assert all(t >= 50.0 for t in ts)

    def test_n_clamped_to_at_least_one(self):
        ts = grid_timestamps(0.0, 100.0, 0)
        assert len(ts) == 1
        assert 0.0 < ts[0] < 100.0
