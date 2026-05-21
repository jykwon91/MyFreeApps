"""Unit tests for the PR3 throw-technique extractor.

Full ``extract_technique_for_lineup`` orchestration with every external
(download / frame extract / Claude / repo commit) mocked. Asserts the gate
order, structured generated/skipped/failed outcomes, and the source-video
cleanup ownership (reused vs re-fetched) — mirrors the PR2 clip generator
test posture exactly so the two paths stay symmetric.
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification.classification_result import (
    ThrowTechniqueResult,
)
from app.services.ingestion.technique_extractor import (
    TechniqueGenerationResult,
    extract_technique_for_lineup,
)
from app.services.ingestion.frame_extractor import FrameExtractionError
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.technique_extractor"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"


def _lineup(video_id="vid123", chapter_title="B smoke"):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_title=chapter_title,
        technique=None,
    )


def _settings(enable=True, key="sk-test"):
    s = MagicMock()
    s.enable_classifier = enable
    s.anthropic_api_key = key
    return s


def _technique(**kw):
    base = dict(
        success=True,
        technique="Jumpthrow + LMB",
        confidence=0.82,
        reasoning="ok",
    )
    base.update(kw)
    return ThrowTechniqueResult(**base)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestExtractTechniqueGenerated:
    @pytest.mark.asyncio
    async def test_generated_reuses_provided_video_and_persists_technique(
        self, tmp_path: Path
    ):
        video = tmp_path / "vid123.mp4"
        video.write_bytes(b"src")
        lineup = _lineup()
        db = MagicMock()

        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(
                f"{_MOD}.clip_window_timestamps",
                return_value=[1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            ),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(return_value=[_FAKE_PNG] * 6),
            ),
            patch(
                f"{_MOD}.classify_throw_technique_from_frames",
                new=AsyncMock(return_value=_technique()),
            ) as mock_classify,
            patch(f"{_MOD}.download_video", new=AsyncMock()) as mock_dl,
            patch(
                f"{_MOD}.lineup_repo.set_technique", new=AsyncMock()
            ) as mock_set,
        ):
            result = await extract_technique_for_lineup(
                db,
                lineup,
                chapter_start=0.0,
                chapter_end=30.0,
                game_slug="cs2",
                video_path=video,
            )

        assert result.status == "generated"
        assert result.technique == "Jumpthrow + LMB"
        assert result.confidence == 0.82
        mock_dl.assert_not_awaited()  # provided video reused, no re-fetch
        mock_set.assert_awaited_once()
        # game_slug threaded through to the Claude call (vocab block selection).
        assert mock_classify.call_args.kwargs["game_slug"] == "cs2"
        # A reused (caller-owned) video must NOT be deleted here.
        assert video.exists()

    @pytest.mark.asyncio
    async def test_refetch_path_downloads_and_cleans_up(self, tmp_path: Path):
        fetched = tmp_path / "vid123.mp4"
        fetched.write_bytes(b"src")
        lineup = _lineup()

        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(
                f"{_MOD}.clip_window_timestamps",
                return_value=[1.0, 2.0, 3.0, 4.0],
            ),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(return_value=[_FAKE_PNG] * 4),
            ),
            patch(
                f"{_MOD}.classify_throw_technique_from_frames",
                new=AsyncMock(return_value=_technique()),
            ),
            patch(
                f"{_MOD}.download_video",
                new=AsyncMock(return_value=fetched),
            ) as mock_dl,
            patch(f"{_MOD}.lineup_repo.set_technique", new=AsyncMock()),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                lineup,
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=None,
                download_dir=tmp_path,
            )

        assert result.status == "generated"
        mock_dl.assert_awaited_once()
        # A re-fetched (self-owned) video MUST be cleaned up.
        assert not fetched.exists()


# ---------------------------------------------------------------------------
# Skips — none of these should hit set_technique
# ---------------------------------------------------------------------------


class TestExtractTechniqueSkips:
    async def _skip(
        self,
        *,
        technique=None,
        settings=None,
        lineup=None,
        video=None,
    ):
        with (
            patch(f"{_MOD}.settings", settings or _settings()),
            patch(
                f"{_MOD}.clip_window_timestamps",
                return_value=[1.0, 2.0, 3.0],
            ),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(return_value=[_FAKE_PNG] * 3),
            ),
            patch(
                f"{_MOD}.classify_throw_technique_from_frames",
                new=AsyncMock(return_value=technique or _technique()),
            ),
            patch(f"{_MOD}.download_video", new=AsyncMock()),
            patch(
                f"{_MOD}.lineup_repo.set_technique", new=AsyncMock()
            ) as mock_set,
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                lineup or _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=video,
            )
        return result, mock_set

    @pytest.mark.asyncio
    async def test_no_source_video(self):
        result, sett = await self._skip(lineup=_lineup(video_id=None))
        assert result.status == "skipped"
        assert result.skip_reason == "no_source_video"
        sett.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_classifier_disabled_short_circuits(self):
        result, sett = await self._skip(settings=_settings(enable=False))
        assert result.status == "skipped"
        assert result.skip_reason == "classifier_disabled"
        sett.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_missing_api_key_short_circuits(self):
        result, sett = await self._skip(settings=_settings(key=""))
        assert result.status == "skipped"
        assert result.skip_reason == "classifier_unavailable:missing_api_key"
        sett.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_null_technique_from_model_is_skipped_not_failed(
        self, tmp_path: Path
    ):
        """``success=True`` + ``technique=None`` is a valid 'cannot determine'
        answer (motion not visible / gated below 0.55) — must NOT persist and
        must NOT be a failure. Footer simply shows nothing."""
        v = tmp_path / "v.mp4"
        v.write_bytes(b"x")
        gated = ThrowTechniqueResult(
            success=True,
            technique=None,
            confidence=0.40,
            reasoning="below gate",
            error_codes=["technique_low_confidence:0.40"],
        )
        result, sett = await self._skip(technique=gated, video=v)
        assert result.status == "skipped"
        assert result.skip_reason == "no_technique"
        # Structured gate codes ride through for operator visibility.
        assert "technique_low_confidence:0.40" in result.error_codes
        sett.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_empty_clip_window(self, tmp_path: Path):
        v = tmp_path / "v.mp4"
        v.write_bytes(b"x")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[]),
            patch(
                f"{_MOD}.lineup_repo.set_technique", new=AsyncMock()
            ) as sett,
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=0.05,
                video_path=v,
            )
        assert result.status == "skipped"
        assert result.skip_reason == "empty_clip_window"
        sett.assert_not_awaited()


# ---------------------------------------------------------------------------
# Failures — structured error_codes per check-third-party-error-codes
# ---------------------------------------------------------------------------


class TestExtractTechniqueFailures:
    @pytest.mark.asyncio
    async def test_refetch_without_download_dir_fails_loud(self):
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=None,
                download_dir=None,
            )
        assert result.status == "failed"
        assert result.error_codes == ["no_download_dir"]

    @pytest.mark.asyncio
    async def test_download_failure(self, tmp_path: Path):
        exc = VideoDownloadError(
            "gone",
            video_id="vid123",
            error_type="UnavailableVideoError",
            original=Exception(),
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(
                f"{_MOD}.download_video", new=AsyncMock(side_effect=exc)
            ),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=None,
                download_dir=tmp_path,
            )
        assert result.status == "failed"
        assert result.error_codes == ["download:UnavailableVideoError"]

    @pytest.mark.asyncio
    async def test_frame_extract_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"
        v.write_bytes(b"x")
        exc = FrameExtractionError(
            "boom", timestamp=5.0, returncode=1, stderr="e"
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(side_effect=exc),
            ),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["frame_extract:rc=1"]

    @pytest.mark.asyncio
    async def test_technique_classifier_call_failure(self, tmp_path: Path):
        v = tmp_path / "v.mp4"
        v.write_bytes(b"x")
        failed = ThrowTechniqueResult(
            success=False,
            error_codes=["rate_limit_error"],
            reasoning="rate limited",
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.clip_window_timestamps", return_value=[1.0, 2.0]),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(return_value=[_FAKE_PNG] * 2),
            ),
            patch(
                f"{_MOD}.classify_throw_technique_from_frames",
                new=AsyncMock(return_value=failed),
            ),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["rate_limit_error"]

    @pytest.mark.asyncio
    async def test_persist_failure_keeps_row_unchanged(self, tmp_path: Path):
        """A repo write error must NOT raise — backfill is idempotent, so the
        failed row stays NULL and is retried on the next run with a structured
        ``technique_persist_failed`` code."""
        v = tmp_path / "v.mp4"
        v.write_bytes(b"x")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(
                f"{_MOD}.clip_window_timestamps",
                return_value=[1.0, 2.0, 3.0, 4.0],
            ),
            patch(
                f"{_MOD}.extract_frames_downscaled",
                new=AsyncMock(return_value=[_FAKE_PNG] * 4),
            ),
            patch(
                f"{_MOD}.classify_throw_technique_from_frames",
                new=AsyncMock(return_value=_technique()),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_technique",
                new=AsyncMock(side_effect=RuntimeError("commit blew up")),
            ),
        ):
            result = await extract_technique_for_lineup(
                MagicMock(),
                _lineup(),
                chapter_start=0.0,
                chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["technique_persist_failed"]
