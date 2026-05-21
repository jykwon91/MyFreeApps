"""Unit tests for the shared wide-source cut+upload helper.

Three callers consume :func:`cut_and_upload_wide_source` — clip_generator,
landing_clip_generator, and widen_source_backfill. The helper itself MUST
be best-effort (ffmpeg/MinIO failures captured into structured codes,
never raised) and the bounds + offsets math MUST be exact (the trim
editor's slider math depends on it).
"""
from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion.frame_extractor import ClipCutError, wide_source_bounds
from app.services.ingestion.wide_source import (
    WideSourceResult,
    cut_and_upload_wide_source,
    tight_offsets_within_source,
)

_MOD = "app.services.ingestion.wide_source"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


# ---------------------------------------------------------------------------
# wide_source_bounds — pure math
# ---------------------------------------------------------------------------


class TestWideSourceBounds:
    def test_normal_window_extends_chapter(self):
        # chapter [10, 40], pre=15, post=15 → [max(0, -5), 55] = [0, 55]
        start, dur = wide_source_bounds(
            10.0, 40.0, pre_seconds=15.0, post_seconds=15.0,
        )
        # 10 - 15 = -5 → clamped at 0
        assert start == pytest.approx(0.0)
        assert dur == pytest.approx(55.0)

    def test_pre_clamps_at_zero(self):
        # Chapter starts at 5; 15s pre would underflow → start clamped at 0,
        # duration = (5 + 30 + 15) - 0 = 50.
        start, dur = wide_source_bounds(
            5.0, 30.0, pre_seconds=15.0, post_seconds=15.0,
        )
        assert start == pytest.approx(0.0)
        assert dur == pytest.approx(45.0)

    def test_late_chapter_keeps_full_pre(self):
        # Chapter [200, 230], pre=15, post=15 → [185, 245] = 60s.
        start, dur = wide_source_bounds(
            200.0, 230.0, pre_seconds=15.0, post_seconds=15.0,
        )
        assert start == pytest.approx(185.0)
        assert dur == pytest.approx(60.0)

    def test_zero_padding_returns_exact_chapter(self):
        # Sanity: with pre=0/post=0 we get exactly the chapter bounds.
        start, dur = wide_source_bounds(
            50.0, 80.0, pre_seconds=0.0, post_seconds=0.0,
        )
        assert start == pytest.approx(50.0)
        assert dur == pytest.approx(30.0)

    def test_asymmetric_padding(self):
        # 5s pre, 20s post — operator might want more lead-in OR tail.
        start, dur = wide_source_bounds(
            100.0, 110.0, pre_seconds=5.0, post_seconds=20.0,
        )
        assert start == pytest.approx(95.0)
        assert dur == pytest.approx(35.0)


# ---------------------------------------------------------------------------
# tight_offsets_within_source — pure math
# ---------------------------------------------------------------------------


class TestTightOffsetsWithinSource:
    def test_tight_inside_wide(self):
        # Tight [50, 56] (duration 6) inside wide that starts at 35.
        # Offsets: start_in_wide=50-35=15; end_in_wide=15+6=21.
        start, end = tight_offsets_within_source(
            tight_start=50.0, tight_duration=6.0, source_start=35.0,
        )
        assert start == pytest.approx(15.0)
        assert end == pytest.approx(21.0)

    def test_tight_at_source_start(self):
        # Edge: tight begins right at the wide's start → offset 0.
        start, end = tight_offsets_within_source(
            tight_start=10.0, tight_duration=4.0, source_start=10.0,
        )
        assert start == pytest.approx(0.0)
        assert end == pytest.approx(4.0)

    def test_tight_offset_when_wide_pre_clamped(self):
        # Wide is clamped to start at 0; tight at 5, duration 2 → [5, 7] in
        # source coordinates (matches the source-timeline contract).
        start, end = tight_offsets_within_source(
            tight_start=5.0, tight_duration=2.0, source_start=0.0,
        )
        assert start == pytest.approx(5.0)
        assert end == pytest.approx(7.0)


# ---------------------------------------------------------------------------
# cut_and_upload_wide_source — orchestration with ffmpeg + MinIO mocked
# ---------------------------------------------------------------------------


def _lineup_id():
    return uuid.uuid4()


class TestCutAndUploadWideSource:
    @pytest.mark.asyncio
    async def test_success_returns_key_and_bounds(self, tmp_path: Path):
        video = tmp_path / "v.mp4"; video.write_bytes(b"src")
        storage = MagicMock()
        settings = MagicMock()
        settings.clip_source_pre_seconds = 15.0
        settings.clip_source_post_seconds = 15.0

        with (
            patch(f"{_MOD}.settings", settings),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)) as cut,
            patch(f"{_MOD}.get_storage", return_value=storage),
        ):
            result = await cut_and_upload_wide_source(
                local_video=video,
                video_id="vid123",
                chapter_start=20.0,
                chapter_end=50.0,
                source_key="pending/vid123/20-clip-source.mp4",
                log_prefix="test",
                lineup_id=_lineup_id(),
            )

        assert result.succeeded is True
        assert result.source_key == "pending/vid123/20-clip-source.mp4"
        # 20 - 15 = 5 (no clamp); 50 + 15 = 65; duration = 60
        assert result.source_start_s == pytest.approx(5.0)
        assert result.source_duration_s == pytest.approx(60.0)
        cut.assert_awaited_once_with(video, 5.0, 60.0)
        storage.upload_file.assert_called_once()
        # MIME type matches the rest of the clip pipeline.
        assert storage.upload_file.call_args[0][2] == "video/mp4"

    @pytest.mark.asyncio
    async def test_cut_failure_returns_structured_error(self, tmp_path: Path):
        """ffmpeg failure NEVER raises — captured into error_codes so the
        caller (ingest path or backfill) can route on it. Per
        rules/check-third-party-error-codes.md."""
        video = tmp_path / "v.mp4"; video.write_bytes(b"src")
        settings = MagicMock()
        settings.clip_source_pre_seconds = 15.0
        settings.clip_source_post_seconds = 15.0
        exc = ClipCutError("boom", start=5.0, duration=60.0, returncode=42, stderr="x")

        with (
            patch(f"{_MOD}.settings", settings),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(side_effect=exc)),
            patch(f"{_MOD}.get_storage") as get_storage_mock,
        ):
            result = await cut_and_upload_wide_source(
                local_video=video,
                video_id="vid123",
                chapter_start=20.0,
                chapter_end=50.0,
                source_key="pending/vid123/20-clip-source.mp4",
                log_prefix="test",
                lineup_id=_lineup_id(),
            )

        assert result.succeeded is False
        assert result.source_key is None
        assert "wide_source_cut:rc=42" in result.error_codes
        # MinIO must NOT be touched when the cut failed — no orphan bytes.
        get_storage_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_upload_failure_returns_structured_error(
        self, tmp_path: Path,
    ):
        """MinIO failure NEVER raises — same shape as the cut-failure path."""
        video = tmp_path / "v.mp4"; video.write_bytes(b"src")
        storage = MagicMock()
        storage.upload_file.side_effect = RuntimeError("minio down")
        settings = MagicMock()
        settings.clip_source_pre_seconds = 15.0
        settings.clip_source_post_seconds = 15.0

        with (
            patch(f"{_MOD}.settings", settings),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=storage),
        ):
            result = await cut_and_upload_wide_source(
                local_video=video,
                video_id="vid123",
                chapter_start=20.0,
                chapter_end=50.0,
                source_key="pending/vid123/20-clip-source.mp4",
                log_prefix="test",
                lineup_id=_lineup_id(),
            )

        assert result.succeeded is False
        assert result.source_key is None
        assert "wide_source_upload_failed" in result.error_codes


class TestWideSourceResult:
    def test_empty_init_defaults_to_failure(self):
        """A bare WideSourceResult() represents failure (no key, empty
        error_codes). Useful as a sentinel for the legacy posture."""
        r = WideSourceResult()
        assert r.succeeded is False
        assert r.error_codes == []

    def test_succeeded_requires_source_key(self):
        r = WideSourceResult(
            source_key="k", source_start_s=1.0, source_duration_s=2.0,
        )
        assert r.succeeded is True
