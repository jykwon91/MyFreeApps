"""Unit tests for the PR2 clip generator.

Pure clip-bounds math + the full generate_clip_for_lineup orchestration with
every external (download / frame extract / Claude / ffmpeg cut / MinIO / repo
commit) mocked. Asserts the frozen-contract gate, the structured
generated/skipped/failed outcomes, and the source-video cleanup ownership
(reused vs re-fetched).
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification.classification_result import ThrowTimingResult
from app.services.ingestion.clip_generator import (
    ClipGenerationResult,
    _compute_clip_bounds,
    generate_clip_for_lineup,
    pending_clip_key,
)
from app.services.ingestion.frame_extractor import ClipCutError, FrameExtractionError
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.clip_generator"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _lineup(video_id="vid123", chapter_title="B smoke"):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_title=chapter_title,
        clip_url=None,
    )


# ---------------------------------------------------------------------------
# _compute_clip_bounds — pure math
# ---------------------------------------------------------------------------

class TestComputeClipBounds:
    def test_normal_window_within_band(self):
        # release 20, result 24, chapter [10,40]: [18, 24.5] = 6.5s in [2,12].
        start, dur = _compute_clip_bounds(20.0, 24.0, 10.0, 40.0)
        assert start == pytest.approx(18.0)
        assert dur == pytest.approx(6.5)

    def test_clamped_to_chapter_start(self):
        # release 11 → 11-2=9 but chapter starts at 10 → clamp to 10.
        start, dur = _compute_clip_bounds(11.0, 13.0, 10.0, 40.0)
        assert start == pytest.approx(10.0)

    def test_too_long_rebuilds_throw_centric_6s(self):
        # release 20, result 60, chapter [10,90]: raw 42.5s > 12 → rebuild to
        # ~6s anchored at release: [18, 24].
        start, dur = _compute_clip_bounds(20.0, 60.0, 10.0, 90.0)
        assert start == pytest.approx(18.0)
        assert dur == pytest.approx(6.0)

    def test_missing_result_collapses_to_25s_clip(self):
        # result_ts == release_ts (no result frame): [release-2, release+0.5]
        # = 2.5s, which is within the [2,12] band by frozen-contract design.
        start, dur = _compute_clip_bounds(20.0, 20.0, 0.0, 60.0)
        assert dur == pytest.approx(2.5)

    def test_chapter_too_short_returns_none(self):
        # 0.5s chapter — even the rebuilt window is < 1s → skip signal.
        assert _compute_clip_bounds(20.0, 20.0, 20.0, 20.5) is None

    def test_clip_never_exceeds_chapter_end(self):
        start, dur = _compute_clip_bounds(20.0, 24.0, 10.0, 23.0)
        assert start + dur <= 23.0 + 1e-9


def test_pending_clip_key_is_deterministic():
    # Stable key per (video, chapter start) → backfill idempotency.
    assert pending_clip_key("abc", 42.0) == "pending/abc/42-clip.mp4"
    assert pending_clip_key("abc", 42.9) == "pending/abc/42-clip.mp4"


# ---------------------------------------------------------------------------
# generate_clip_for_lineup — orchestration
# ---------------------------------------------------------------------------

def _settings(enable=True, key="sk-test"):
    s = MagicMock()
    s.enable_classifier = enable
    s.anthropic_api_key = key
    return s


def _timing(**kw):
    base = dict(
        success=True, is_lineup_throw=True, release_index=2,
        result_index=4, confidence=0.8, reasoning="ok",
    )
    base.update(kw)
    return ThrowTimingResult(**base)


class TestGenerateClipGeneratedPath:
    @pytest.mark.asyncio
    async def test_generated_reuses_provided_video_and_persists_key(
        self, tmp_path: Path
    ):
        video = tmp_path / "vid123.mp4"
        video.write_bytes(b"src")
        lineup = _lineup()
        db = MagicMock()
        storage = MagicMock()

        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 6)),
            patch(f"{_MOD}.classify_throw_timing_from_frames", new=AsyncMock(return_value=_timing())),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)) as mock_cut,
            patch(f"{_MOD}.get_storage", return_value=storage),
            patch(f"{_MOD}.download_video", new=AsyncMock()) as mock_dl,
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                db, lineup, chapter_start=0.0, chapter_end=30.0,
                video_path=video,
            )

        assert result.status == "generated"
        assert result.clip_key == "pending/vid123/0-clip.mp4"
        mock_dl.assert_not_awaited()  # provided video reused, no re-fetch
        storage.upload_file.assert_called_once()
        assert storage.upload_file.call_args[0][2] == "video/mp4"
        mock_set.assert_awaited_once()
        mock_cut.assert_awaited_once()
        # A reused (caller-owned) video must NOT be deleted here.
        assert video.exists()

    @pytest.mark.asyncio
    async def test_refetch_path_downloads_and_cleans_up(self, tmp_path: Path):
        fetched = tmp_path / "vid123.mp4"
        fetched.write_bytes(b"src")
        lineup = _lineup()

        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0, 3.0, 4.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 4)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=_timing(release_index=1, result_index=2))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.download_video", new=AsyncMock(return_value=fetched)) as mock_dl,
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), lineup, chapter_start=0.0, chapter_end=30.0,
                video_path=None, download_dir=tmp_path,
            )

        assert result.status == "generated"
        mock_dl.assert_awaited_once()
        # A re-fetched (self-owned) video MUST be cleaned up.
        assert not fetched.exists()


class TestGenerateClipSkips:
    async def _skip(self, *, timing=None, settings=None, lineup=None, video=None):
        with (
            patch(f"{_MOD}.settings", settings or _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0, 3.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 3)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=timing or _timing())),
            patch(f"{_MOD}.cut_clip", new=AsyncMock()) as mock_cut,
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.download_video", new=AsyncMock()),
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), lineup or _lineup(),
                chapter_start=0.0, chapter_end=30.0,
                video_path=video,
            )
        return result, mock_cut, mock_set

    @pytest.mark.asyncio
    async def test_not_a_throw(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        result, cut, sett = await self._skip(
            timing=_timing(is_lineup_throw=False, release_index=None,
                           result_index=None, confidence=0.05),
            video=v,
        )
        assert result.status == "skipped"
        assert result.skip_reason == "not_a_throw"
        cut.assert_not_awaited()
        sett.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_low_confidence_below_055_gate(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        result, cut, _ = await self._skip(
            timing=_timing(confidence=0.54), video=v
        )
        assert result.status == "skipped"
        assert result.skip_reason.startswith("low_confidence")
        cut.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_release_frame(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        result, _, _ = await self._skip(
            timing=_timing(release_index=None), video=v
        )
        assert result.status == "skipped"
        assert result.skip_reason == "no_release_frame"

    @pytest.mark.asyncio
    async def test_classifier_disabled_short_circuits(self):
        result, cut, _ = await self._skip(settings=_settings(enable=False))
        assert result.status == "skipped"
        assert result.skip_reason == "classifier_disabled"
        cut.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_missing_api_key_short_circuits(self):
        result, _, _ = await self._skip(settings=_settings(key=""))
        assert result.status == "skipped"
        assert result.skip_reason == "classifier_unavailable:missing_api_key"

    @pytest.mark.asyncio
    async def test_no_source_video_id(self):
        result, _, _ = await self._skip(lineup=_lineup(video_id=None))
        assert result.status == "skipped"
        assert result.skip_reason == "no_source_video"

    @pytest.mark.asyncio
    async def test_chapter_too_short_for_clip(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        # release==result and a sub-second chapter → bounds None → skip.
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[20.0, 20.1, 20.2]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 3)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=_timing(release_index=1, result_index=1))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock()) as mock_cut,
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.download_video", new=AsyncMock()),
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=20.0, chapter_end=20.5,
                video_path=v,
            )
        assert result.status == "skipped"
        assert result.skip_reason == "chapter_too_short_for_clip"
        mock_cut.assert_not_awaited()


class TestGenerateClipFailures:
    @pytest.mark.asyncio
    async def test_refetch_without_download_dir_fails_loud(self):
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=None, download_dir=None,
            )
        assert result.status == "failed"
        assert result.error_codes == ["no_download_dir"]

    @pytest.mark.asyncio
    async def test_download_failure(self, tmp_path: Path):
        exc = VideoDownloadError(
            "gone", video_id="vid123", error_type="UnavailableVideoError",
            original=Exception(),
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(f"{_MOD}.download_video", new=AsyncMock(side_effect=exc)),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=None, download_dir=tmp_path,
            )
        assert result.status == "failed"
        assert result.error_codes == ["download:UnavailableVideoError"]

    @pytest.mark.asyncio
    async def test_frame_extract_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        exc = FrameExtractionError("boom", timestamp=5.0, returncode=1, stderr="e")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(side_effect=exc)),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["frame_extract:rc=1"]

    @pytest.mark.asyncio
    async def test_throw_timing_call_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        failed_timing = ThrowTimingResult(
            success=False, error_codes=["rate_limit_error"],
            reasoning="rate limited",
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 2)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=failed_timing)),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["rate_limit_error"]

    @pytest.mark.asyncio
    async def test_clip_cut_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        exc = ClipCutError("nope", start=1.0, duration=6.0, returncode=1, stderr="e")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0, 3.0, 4.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 4)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=_timing(release_index=1, result_index=2))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(side_effect=exc)),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["clip_cut:rc=1"]

    @pytest.mark.asyncio
    async def test_upload_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        storage = MagicMock()
        storage.upload_file.side_effect = RuntimeError("minio down")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0, 3.0, 4.0]),
            patch(f"{_MOD}.extract_frames_downscaled", new=AsyncMock(return_value=[_FAKE_PNG] * 4)),
            patch(f"{_MOD}.classify_throw_timing_from_frames",
                  new=AsyncMock(return_value=_timing(release_index=1, result_index=2))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=storage),
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["clip_upload_failed"]
        mock_set.assert_not_awaited()  # nothing persisted on upload failure
