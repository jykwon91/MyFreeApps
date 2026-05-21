"""Unit tests for the PR6 stand + aim micro-clip generator.

Pure micro-bounds math + the full generate_micro_clips_for_lineup
orchestration with every external (download / frame extract / Claude /
ffmpeg cut / MinIO / repo commit) mocked. Asserts the frozen-contract
gate sharing with PR5 (precomputed pair skips the classifier entirely)
and the structured per-side generated / skipped / failed outcomes.

Mirrors :mod:`test_landing_clip_generator` so the two pipelines stay
synchronised. Re-read PR5's tests when porting any behaviour change.
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification.classification_result import (
    ClassificationResult,
)
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
)
from app.services.ingestion.micro_clip_generator import (
    _compute_micro_bounds,
    generate_micro_clips_for_lineup,
    pending_aim_clip_key,
    pending_stand_clip_key,
)
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.micro_clip_generator"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _lineup(video_id="vid123", chapter_title="B smoke"):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_title=chapter_title,
        attribution_author=None,
        stand_clip_url=None,
        aim_clip_url=None,
    )


# ---------------------------------------------------------------------------
# _compute_micro_bounds — pure math
# ---------------------------------------------------------------------------

class TestComputeMicroBounds:
    def test_normal_window(self):
        # anchor 24, chapter [10,40]: [24, 25] = 1.0s.
        start, dur = _compute_micro_bounds(24.0, 10.0, 40.0)
        assert start == pytest.approx(24.0)
        assert dur == pytest.approx(1.0)

    def test_clamped_to_chapter_start(self):
        # anchor 9.5 (before start 10): start clamps to 10, duration 1.0.
        start, dur = _compute_micro_bounds(9.5, 10.0, 40.0)
        assert start == pytest.approx(10.0)
        assert dur == pytest.approx(1.0)

    def test_clamped_to_chapter_end_tail(self):
        # anchor 39.7, chapter ends 40 → clip [39.7, 40] = 0.3s — too short.
        assert _compute_micro_bounds(39.7, 10.0, 40.0) is None

    def test_clamped_tail_above_threshold_is_kept(self):
        # anchor 39.4, chapter ends 40 → [39.4, 40] = 0.6s, above 0.5s threshold.
        start, dur = _compute_micro_bounds(39.4, 10.0, 40.0)
        assert start == pytest.approx(39.4)
        assert dur == pytest.approx(0.6)

    def test_chapter_too_short_returns_none(self):
        # 0.4s chapter — clamped window < 0.5s → skip signal.
        assert _compute_micro_bounds(20.0, 19.9, 20.3) is None

    def test_clip_never_exceeds_chapter_end(self):
        start, dur = _compute_micro_bounds(21.5, 10.0, 22.0)
        assert start + dur <= 22.0 + 1e-9

    def test_start_equals_anchor_for_overlay_accuracy(self):
        """The first frame of the AIM clip MUST equal the anchor still —
        otherwise the persisted aim_anchor_x/y pixel coords don't apply."""
        start, _dur = _compute_micro_bounds(24.0, 10.0, 40.0)
        assert start == pytest.approx(24.0)


def test_pending_micro_clip_keys_are_deterministic():
    """Stable key per (video, chapter start) → backfill idempotency."""
    assert pending_stand_clip_key("abc", 42.0) == "pending/abc/42-stand-micro.mp4"
    assert pending_aim_clip_key("abc", 42.0) == "pending/abc/42-aim-micro.mp4"
    assert pending_stand_clip_key("abc", 42.9) == "pending/abc/42-stand-micro.mp4"


def test_micro_clip_keys_distinct_from_other_clip_keys():
    """All four key shapes (throw / landing / stand / aim) MUST differ so a
    backfill never overwrites a sibling pipeline's object."""
    from app.services.ingestion.clip_generator import pending_clip_key
    from app.services.ingestion.landing_clip_generator import (
        pending_landing_clip_key,
    )

    keys = {
        pending_clip_key("abc", 42),
        pending_landing_clip_key("abc", 42),
        pending_stand_clip_key("abc", 42),
        pending_aim_clip_key("abc", 42),
    }
    assert len(keys) == 4, f"Key collision: {keys}"


# ---------------------------------------------------------------------------
# generate_micro_clips_for_lineup — ingest path (precomputed pair)
# ---------------------------------------------------------------------------

def _ffmpeg_cut_mock():
    return AsyncMock(return_value=_FAKE_MP4)


def _storage_mock():
    storage = MagicMock()
    storage.upload_file = MagicMock()
    return storage


@pytest.mark.asyncio
async def test_ingest_path_generates_both_clips_without_classifier_call():
    """Precomputed stand+aim ts → skip classifier; cut + upload + persist twice."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    classifier_mock = AsyncMock()  # MUST NOT be called

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()) as cut,
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}.classify_frames_for_lineup_decision", classifier_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            precomputed_aim_ts=24.0,
        )

    assert result.stand_status == "generated"
    assert result.aim_status == "generated"
    assert result.stand_clip_key == "pending/vid123/10-stand-micro.mp4"
    assert result.aim_clip_key == "pending/vid123/10-aim-micro.mp4"
    assert result.stand_ts == pytest.approx(12.0)
    assert result.aim_ts == pytest.approx(24.0)
    assert cut.await_count == 2
    assert storage.upload_file.call_count == 2
    set_stand_mock.assert_awaited_once()
    set_aim_mock.assert_awaited_once()
    classifier_mock.assert_not_awaited(), (
        "Ingest path must NOT call the classifier — cost regression"
    )


@pytest.mark.asyncio
async def test_ingest_path_mixed_precomputed_is_wiring_bug():
    """One side precomputed, the other None → caller error (both fail)."""
    db = AsyncMock()
    lineup = _lineup()
    result = await generate_micro_clips_for_lineup(
        db, lineup,
        chapter_start=10.0, chapter_end=40.0,
        video_path=Path("/tmp/x.mp4"),
        precomputed_stand_ts=12.0,
        precomputed_aim_ts=None,  # missing!
    )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "precomputed_pair_mismatch" in result.stand_error_codes
    assert "precomputed_pair_mismatch" in result.aim_error_codes


@pytest.mark.asyncio
async def test_ingest_path_chapter_too_short_skips_both():
    """A sliver chapter clamps below 0.5s → both sides skip."""
    db = AsyncMock()
    lineup = _lineup()
    result = await generate_micro_clips_for_lineup(
        db, lineup,
        chapter_start=19.9, chapter_end=20.3,
        video_path=Path("/tmp/x.mp4"),
        precomputed_stand_ts=20.0,
        precomputed_aim_ts=20.1,
    )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "chapter_too_short_for_microclip"
    assert result.aim_skip_reason == "chapter_too_short_for_microclip"


# ---------------------------------------------------------------------------
# generate_micro_clips_for_lineup — backfill path (own classifier call)
# ---------------------------------------------------------------------------

def _settings(enable=True, key="sk-test"):
    s = MagicMock()
    s.enable_classifier = enable
    s.anthropic_api_key = key
    return s


def _grid(**kw):
    base = dict(
        success=True, is_lineup=True,
        best_stand_index=2, best_aim_index=5,
        reasoning="ok", error_codes=[],
    )
    base.update(kw)
    return ClassificationResult(**base)


@pytest.mark.asyncio
async def test_backfill_path_runs_classifier_and_generates():
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)
    grid = _grid(best_stand_index=2, best_aim_index=5)
    timestamps = [12.0, 18.0, 24.0, 30.0, 36.0]

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 5)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            # No precomputed → backfill branch.
        )

    assert result.stand_status == "generated"
    assert result.aim_status == "generated"
    # best_stand_index 2 (1-based) → timestamps[1] = 18.0.
    # best_aim_index 5 (1-based) → timestamps[4] = 36.0.
    assert result.stand_ts == pytest.approx(18.0)
    assert result.aim_ts == pytest.approx(36.0)


@pytest.mark.asyncio
async def test_backfill_path_skips_not_a_lineup():
    db = AsyncMock()
    lineup = _lineup()
    grid = _grid(is_lineup=False, best_stand_index=None, best_aim_index=None)
    timestamps = [12.0, 18.0, 24.0]

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "backfill_not_a_lineup"
    assert result.aim_skip_reason == "backfill_not_a_lineup"


@pytest.mark.asyncio
async def test_backfill_path_classifier_disabled_skips_both():
    db = AsyncMock()
    lineup = _lineup()
    with patch(f"{_MOD}.settings", _settings(enable=False)):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "classifier_disabled"
    assert result.aim_skip_reason == "classifier_disabled"


@pytest.mark.asyncio
async def test_backfill_path_classifier_missing_key_skips_both():
    db = AsyncMock()
    lineup = _lineup()
    with patch(f"{_MOD}.settings", _settings(key="")):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert "missing_api_key" in result.stand_skip_reason
    assert "missing_api_key" in result.aim_skip_reason


@pytest.mark.asyncio
async def test_backfill_path_classifier_api_failure_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    grid = ClassificationResult(
        success=False, error_codes=["overloaded_error"],
        reasoning="rate limited",
    )
    timestamps = [12.0, 18.0, 24.0]
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "overloaded_error" in result.stand_error_codes
    assert "overloaded_error" in result.aim_error_codes


@pytest.mark.asyncio
async def test_backfill_path_frame_extract_failure_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    timestamps = [12.0, 18.0, 24.0]
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(
            f"{_MOD}.extract_frames",
            AsyncMock(side_effect=FrameExtractionError(
                "boom", timestamp=18.0, returncode=1, stderr="x",
            )),
        ),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert any("frame_extract" in c for c in result.stand_error_codes)


@pytest.mark.asyncio
async def test_backfill_path_download_failure_returns_failed(tmp_path):
    """When the generator owns the download (video_path=None), a yt-dlp
    failure surfaces as status=failed (both sides) with structured codes."""
    db = AsyncMock()
    lineup = _lineup()
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(
            f"{_MOD}.download_video",
            AsyncMock(side_effect=VideoDownloadError(
                "boom", video_id="vid123",
                error_type="network", original=Exception(),
            )),
        ),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=None,
            download_dir=tmp_path,
        )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert any("download:network" in c for c in result.stand_error_codes)
    assert any("download:network" in c for c in result.aim_error_codes)


@pytest.mark.asyncio
async def test_backfill_path_no_source_video_skips_both():
    db = AsyncMock()
    lineup = _lineup(video_id=None)
    result = await generate_micro_clips_for_lineup(
        db, lineup,
        chapter_start=0.0, chapter_end=30.0,
        video_path=Path("/tmp/x.mp4"),
    )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "no_source_video"
    assert result.aim_skip_reason == "no_source_video"


# ---------------------------------------------------------------------------
# Per-side independence — a stand failure must NOT leak into aim and v/v
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stand_cut_failure_does_not_affect_aim():
    """The two sides are committed by separate setters; a stand ffmpeg fault
    must leave aim_status='generated', not 'failed'."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    # cut_clip raises on the first call (stand), succeeds on the second (aim).
    cut_side_effects = [
        ClipCutError("boom", start=12.0, duration=1.0, returncode=1, stderr="x"),
        _FAKE_MP4,
    ]

    async def cut_clip_impl(*args, **kwargs):
        outcome = cut_side_effects.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    with (
        patch(f"{_MOD}.cut_clip", AsyncMock(side_effect=cut_clip_impl)),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            precomputed_aim_ts=24.0,
        )

    assert result.stand_status == "failed"
    assert result.aim_status == "generated", (
        "Aim side must not regress when stand cut fails — the two columns "
        "are independent."
    )
    set_stand_mock.assert_not_awaited()
    set_aim_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_stand_persist_failure_does_not_affect_aim():
    """stand-column commit fails but aim succeeds → aim still 'generated'."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(
            f"{_MOD}.lineup_repo.set_stand_clip_url",
            AsyncMock(side_effect=RuntimeError("db down")),
        ),
        patch(
            f"{_MOD}.lineup_repo.set_aim_clip_url",
            AsyncMock(return_value=lineup),
        ),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            precomputed_aim_ts=24.0,
        )
    assert result.stand_status == "failed"
    assert "stand_clip_url_persist_failed" in result.stand_error_codes
    assert result.aim_status == "generated"


@pytest.mark.asyncio
async def test_upload_failure_per_side_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    storage.upload_file = MagicMock(side_effect=RuntimeError("minio down"))

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            precomputed_aim_ts=24.0,
        )
    # Storage down → both sides fail (same underlying fault per side).
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "clip_upload_failed" in result.stand_error_codes
    assert "clip_upload_failed" in result.aim_error_codes
