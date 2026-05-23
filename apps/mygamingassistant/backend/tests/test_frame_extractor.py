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
    ClipCutError,
    FrameExtractionError,
    ProbeError,
    clip_window_timestamps,
    cut_clip,
    extract_frames,
    extract_frames_downscaled,
    grid_timestamps,
    probe_duration,
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00"  # PNG magic bytes header
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64  # MP4 ftyp box header


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


class TestExtractFramesDownscaled:
    @pytest.mark.asyncio
    async def test_returns_bytes_and_adds_scale_filter(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_PNG

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            frames = await extract_frames_downscaled(video, [3.0, 7.0])

        assert frames == [_FAKE_PNG, _FAKE_PNG]
        # Every call must carry the 640x360 scale filter — that downscale is
        # the whole point (token cost), regressing it silently inflates spend.
        for call in mock_run.call_args_list:
            cmd = call[0][0]
            assert "-vf" in cmd
            assert cmd[cmd.index("-vf") + 1] == "scale=640:360"

    @pytest.mark.asyncio
    async def test_raises_frame_extraction_error_on_failure(self, tmp_path: Path):
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = b""
        mock_result.stderr = b"ffmpeg: scale failed"

        with patch("subprocess.run", return_value=mock_result):
            with pytest.raises(FrameExtractionError) as exc_info:
                await extract_frames_downscaled(video, [4.0])

        assert exc_info.value.returncode == 1
        assert exc_info.value.timestamp == 4.0

    @pytest.mark.asyncio
    async def test_does_not_change_full_res_extract_frames(self, tmp_path: Path):
        """The full-res path must NOT gain a scale filter (aim-anchor needs px)."""
        video = tmp_path / "test.mp4"
        video.write_bytes(b"fake")
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = _FAKE_PNG
        with patch("subprocess.run", return_value=mock_result) as mock_run:
            await extract_frames(video, [1.0])
        assert "-vf" not in mock_run.call_args[0][0]


class TestClipWindowTimestamps:
    def test_long_chapter_uses_30pct_skip(self):
        # duration 100s >= 90 → skip 30% → window [30, 100], N=12.
        ts = clip_window_timestamps(0.0, 100.0)
        assert len(ts) == 12
        assert all(30.0 <= t <= 100.0 for t in ts)
        assert ts == sorted(ts)

    def test_medium_chapter_uses_15pct_skip(self):
        # duration 60s (40 <= d < 90) → skip 15% → window [9, 60], N=12.
        ts = clip_window_timestamps(0.0, 60.0)
        assert len(ts) == 12
        assert all(9.0 <= t <= 60.0 for t in ts)

    def test_short_chapter_skips_nothing_regression(self):
        # Regression for the "Market Window - B Site" incident (lineup
        # 7bd971c3, 34s chapter): the old `0.30 if duration >= 20` rule
        # started sampling at 10.2s, missing the actual throw earlier in
        # the chapter, so Claude only saw the post-throw knife-walk and
        # hallucinated a release on a frame with no utility in hand.
        # Under the new tier, <40s gets 0% skip.
        ts = clip_window_timestamps(0.0, 34.0)
        assert len(ts) == 12
        # First sample is within edge_padding of the chapter start — no
        # lead-in trimmed away.
        assert ts[0] < 5.0
        assert all(0.0 < t < 34.0 for t in ts)

    def test_short_remaining_window_uses_8_frames(self):
        # duration 10s < 40 → skip 0% → window [0, 10]; remaining 10 < 12
        # → N = 8.
        ts = clip_window_timestamps(0.0, 10.0)
        assert len(ts) == 8

    def test_long_chapter_caps_to_final_120s(self):
        # duration 400s > 180 → window capped to the final 120s, N=12.
        ts = clip_window_timestamps(0.0, 400.0)
        assert len(ts) == 12
        # Every sample is inside [280, 400] (the last 120s), never the lead-in.
        assert all(280.0 <= t <= 400.0 for t in ts)

    def test_200s_boundary_max_guard(self):
        # duration 200 > 180. skip 30% → window_start 60, but the 120s cap
        # (end-120 = 80) is later, so max() pulls window_start to 80, NOT 60.
        # Pins the exact >180 boundary the cap's max() guard handles.
        ts = clip_window_timestamps(0.0, 200.0)
        assert len(ts) == 12
        assert all(80.0 <= t <= 200.0 for t in ts)
        assert min(ts) >= 80.0  # the 60-80s lead-in is excluded by the cap

    def test_skip_boundary_at_40s_inclusive(self):
        # At exactly 40s, skip is 15% (medium tier is inclusive of 40).
        ts = clip_window_timestamps(0.0, 40.0)
        # 40 * 0.15 = 6.0 → window [6, 40]; remaining 34 >= 12 → N=12.
        assert len(ts) == 12
        assert ts[0] >= 6.0  # nothing in the [0, 6) lead-in

    def test_just_below_40s_uses_no_skip(self):
        # 39.9s falls in the short tier (skip 0%, NOT 15%).
        ts = clip_window_timestamps(0.0, 39.9)
        assert ts[0] < 5.0  # first frame near 0, not at ~6s

    def test_skip_boundary_at_90s_inclusive(self):
        # At exactly 90s, skip is 30% (long tier is inclusive of 90).
        ts = clip_window_timestamps(0.0, 90.0)
        # 90 * 0.30 = 27 → window [27, 90].
        assert len(ts) == 12
        assert ts[0] >= 27.0

    def test_just_below_90s_uses_15pct_skip(self):
        # 89s falls in the medium tier (skip 15%, NOT 30%).
        ts = clip_window_timestamps(0.0, 89.0)
        # 89 * 0.15 = 13.35 → window [13.35, 89]. Must NOT be ~26.7.
        assert ts[0] >= 13.0
        assert ts[0] < 26.0  # confirm we're not in the 30% tier

    def test_very_short_chapter_degrades_safely(self):
        # 5s chapter: skip 0% → window [10, 15]; <12 → N=8; grid_timestamps
        # keeps every sample strictly inside the chapter.
        ts = clip_window_timestamps(10.0, 15.0)
        assert len(ts) == 8
        assert all(10.0 < t < 15.0 for t in ts)


class TestCutClip:
    def _run_writes_output(self, payload: bytes = _FAKE_MP4):
        """subprocess.run side effect: write the ffmpeg output file + succeed.

        The real cut_clip reads the temp file back, so the mock must actually
        produce it (last cmd arg is the output path).
        """
        def _side_effect(cmd, **kwargs):
            Path(cmd[-1]).write_bytes(payload)
            r = MagicMock()
            r.returncode = 0
            r.stderr = b""
            return r
        return _side_effect

    @pytest.mark.asyncio
    async def test_returns_clip_bytes_with_web_safe_encode(self, tmp_path: Path):
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        with patch("subprocess.run", side_effect=self._run_writes_output()) as mr:
            data = await cut_clip(video, 12.0, 6.0)

        assert data == _FAKE_MP4
        cmd = mr.call_args[0][0]
        # Muted + browser-playable + faststart are load-bearing for the
        # autoplay <video> tile; assert they survive refactors.
        assert "-an" in cmd
        assert "yuv420p" in cmd
        assert "+faststart" in cmd
        # Input seek before -i (fast, keyframe-accurate — correct for a clip).
        assert cmd.index("-ss") < cmd.index("-i")
        assert cmd[cmd.index("-t") + 1] == "6.000"

    @pytest.mark.asyncio
    async def test_raises_clip_cut_error_on_nonzero_exit(self, tmp_path: Path):
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        bad = MagicMock()
        bad.returncode = 1
        bad.stderr = b"x264 not found"

        with patch("subprocess.run", return_value=bad):
            with pytest.raises(ClipCutError) as exc_info:
                await cut_clip(video, 5.0, 6.0)

        err = exc_info.value
        assert err.returncode == 1
        assert "x264 not found" in err.stderr
        assert err.start == 5.0
        assert err.duration == 6.0

    @pytest.mark.asyncio
    async def test_raises_clip_cut_error_on_empty_output(self, tmp_path: Path):
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        with patch(
            "subprocess.run", side_effect=self._run_writes_output(payload=b"")
        ):
            with pytest.raises(ClipCutError) as exc_info:
                await cut_clip(video, 1.0, 6.0)

        assert exc_info.value.returncode == -1

    @pytest.mark.asyncio
    async def test_temp_file_cleaned_up(self, tmp_path: Path):
        """No stray .mp4 temp files leak after a successful cut."""
        import glob
        import tempfile

        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")
        before = set(glob.glob(str(Path(tempfile.gettempdir()) / "*.mp4")))

        with patch("subprocess.run", side_effect=self._run_writes_output()):
            await cut_clip(video, 2.0, 6.0)

        after = set(glob.glob(str(Path(tempfile.gettempdir()) / "*.mp4")))
        assert after == before


class TestProbeDuration:
    @pytest.mark.asyncio
    async def test_returns_float_from_ffprobe_stdout(self, tmp_path: Path):
        """ffprobe with -of csv=p=0 emits a bare-number stdout line — we
        parse it as a float and return."""
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        ok = MagicMock()
        ok.returncode = 0
        ok.stdout = b"12.345\n"
        ok.stderr = b""
        with patch("subprocess.run", return_value=ok) as mr:
            duration = await probe_duration(video)

        assert duration == pytest.approx(12.345)
        cmd = mr.call_args[0][0]
        assert cmd[0] == "ffprobe"
        assert "-show_entries" in cmd

    @pytest.mark.asyncio
    async def test_raises_probe_error_on_nonzero_exit(self, tmp_path: Path):
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        bad = MagicMock()
        bad.returncode = 1
        bad.stdout = b""
        bad.stderr = b"Invalid data"
        with patch("subprocess.run", return_value=bad):
            with pytest.raises(ProbeError) as exc_info:
                await probe_duration(video)

        assert exc_info.value.returncode == 1
        assert "Invalid data" in exc_info.value.stderr

    @pytest.mark.asyncio
    async def test_raises_probe_error_on_unparseable_stdout(
        self, tmp_path: Path,
    ):
        """A non-numeric stdout (e.g. ``N/A`` from ffprobe on a corrupt file)
        must be a structured ProbeError, NOT a silent 0.0 — the caller can
        then surface a 5xx with the actionable reason."""
        video = tmp_path / "src.mp4"
        video.write_bytes(b"fake")

        weird = MagicMock()
        weird.returncode = 0
        weird.stdout = b"N/A\n"
        weird.stderr = b""
        with patch("subprocess.run", return_value=weird):
            with pytest.raises(ProbeError) as exc_info:
                await probe_duration(video)

        assert "unparseable duration" in str(exc_info.value)
