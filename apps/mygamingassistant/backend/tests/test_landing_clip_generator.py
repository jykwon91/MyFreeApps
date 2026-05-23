"""Unit tests for the PR5 landing-clip generator.

Pure landing-bounds math + the full generate_landing_clip_for_lineup
orchestration with every external (download / frame extract / Claude /
ffmpeg cut / MinIO / repo commit) mocked. Asserts the frozen-contract gate
sharing with PR2 (precomputed_result_ts skips both the classifier call AND
the gates) and the structured generated / skipped / failed outcomes.

Mirrors :mod:`test_clip_generator` exactly so the two pipelines stay
synchronised. Re-read PR2's tests when porting any behaviour change.
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.classification.classification_result import ThrowTimingResult
from app.services.ingestion.frame_extractor import ClipCutError, FrameExtractionError
from app.services.ingestion.landing_clip_generator import (
    LandingClipGenerationResult,
    _compute_landing_bounds,
    generate_landing_clip_for_lineup,
    pending_landing_clip_key,
    pending_landing_clip_source_key,
)
from app.services.ingestion.throw_localizer import (
    STAGE_COARSE_FAILED,
    STAGE_REFINED,
    RefinedThrowTiming,
)
from app.services.ingestion.wide_source import WideSourceResult
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.landing_clip_generator"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _wide_ok(source_start=10.0, source_duration=45.0,
             source_key="pending/vid123/10-landing-source.mp4"):
    """Successful WideSourceResult for the landing-pane wide cut+upload mock."""
    return WideSourceResult(
        source_key=source_key,
        source_start_s=source_start,
        source_duration_s=source_duration,
    )


def _wide_fail():
    """Failed WideSourceResult — best-effort fall-back to legacy posture."""
    return WideSourceResult(error_codes=["wide_source_cut:rc=1"])


def _lineup(video_id="vid123", chapter_title="B smoke"):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_title=chapter_title,
        landing_clip_url=None,
    )


# ---------------------------------------------------------------------------
# _compute_landing_bounds — pure math
# ---------------------------------------------------------------------------

class TestComputeLandingBounds:
    def test_normal_window(self):
        # result 24, chapter [10,40]: [23.5, 27] = 3.5s.
        start, dur = _compute_landing_bounds(24.0, 10.0, 40.0)
        assert start == pytest.approx(23.5)
        assert dur == pytest.approx(3.5)

    def test_clamped_to_chapter_start(self):
        # result 10.2 → 10.2-0.5=9.7 but chapter starts at 10 → clamp to 10.
        start, _dur = _compute_landing_bounds(10.2, 10.0, 40.0)
        assert start == pytest.approx(10.0)

    def test_clamped_to_chapter_end(self):
        # result 39, chapter [10,40]: 39+3=42 → clamp to 40.
        start, dur = _compute_landing_bounds(39.0, 10.0, 40.0)
        assert start == pytest.approx(38.5)
        # 40 - 38.5 = 1.5s — clamped tail but still >= 1s.
        assert dur == pytest.approx(1.5)

    def test_chapter_too_short_returns_none(self):
        # 0.4s chapter — clamped window < 1s → skip signal.
        assert _compute_landing_bounds(20.0, 19.9, 20.3) is None

    def test_clip_never_exceeds_chapter_end(self):
        start, dur = _compute_landing_bounds(20.0, 10.0, 22.0)
        assert start + dur <= 22.0 + 1e-9


def test_pending_landing_clip_key_is_deterministic():
    """Stable key per (video, chapter start) → backfill idempotency."""
    assert pending_landing_clip_key("abc", 42.0) == "pending/abc/42-landing.mp4"
    assert pending_landing_clip_key("abc", 42.9) == "pending/abc/42-landing.mp4"


def test_pending_landing_key_distinct_from_throw_clip_key():
    """Landing and throw keys MUST differ so they don't overwrite each other.

    Regression guard: a copy-paste typo that aliased both keys to
    ``pending/{vid}/{start}-clip.mp4`` would silently destroy one clip
    every time the other was generated.
    """
    from app.services.ingestion.clip_generator import pending_clip_key

    assert pending_landing_clip_key("abc", 42) != pending_clip_key("abc", 42)


def test_pending_landing_source_key_is_deterministic_and_distinct():
    """Wide landing source key is stable + distinct from the tight key AND
    the throw wide-source key. Sharing any of those would silently destroy
    bytes on the next backfill overwrite."""
    from app.services.ingestion.clip_generator import pending_clip_source_key

    assert (
        pending_landing_clip_source_key("abc", 42.0)
        == "pending/abc/42-landing-source.mp4"
    )
    assert (
        pending_landing_clip_source_key("abc", 42.9)
        == "pending/abc/42-landing-source.mp4"
    )
    # Wide landing != tight landing.
    assert (
        pending_landing_clip_source_key("abc", 42)
        != pending_landing_clip_key("abc", 42)
    )
    # Wide landing != wide throw — separate columns, separate bytes.
    assert (
        pending_landing_clip_source_key("abc", 42)
        != pending_clip_source_key("abc", 42)
    )


# ---------------------------------------------------------------------------
# generate_landing_clip_for_lineup — ingest path (precomputed result_ts)
# ---------------------------------------------------------------------------

def _ffmpeg_cut_mock():
    return AsyncMock(return_value=_FAKE_MP4)


def _storage_mock():
    storage = MagicMock()
    storage.upload_file = MagicMock()
    return storage


@pytest.mark.asyncio
async def test_ingest_path_generates_clip_without_classifier_call():
    """Precomputed result_ts → skip classifier; cut + upload + persist."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_url_mock = AsyncMock(return_value=lineup)

    localizer_mock = AsyncMock()  # MUST NOT be called

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()) as cut,
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_landing_clip_url", set_url_mock),
        patch(f"{_MOD}.localize_throw_with_refinement", localizer_mock),
        # Wide source mocked out — it has its own explicit tests below.
        patch(f"{_MOD}.cut_and_upload_wide_source",
              new=AsyncMock(return_value=_wide_fail())),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
            precomputed_confidence=0.82,
        )

    assert result.status == "generated"
    assert result.clip_key == "pending/vid123/10-landing.mp4"
    assert result.result_ts == pytest.approx(24.0)
    assert result.confidence == pytest.approx(0.82)
    cut.assert_awaited_once()
    storage.upload_file.assert_called_once()
    set_url_mock.assert_awaited_once()
    localizer_mock.assert_not_awaited(), (
        "Ingest path must NOT call the localizer/classifier — both the "
        "coarse and dense Claude calls would be cost regressions"
    )


@pytest.mark.asyncio
async def test_ingest_path_failed_without_video_path_is_wiring_bug():
    """precomputed_result_ts without video_path is a caller error.

    The ingest orchestrator MUST pass the on-disk video — if it didn't, the
    landing-clip generator does not silently work around it by downloading
    (that would double the ingest video-fetch cost on every chapter).
    """
    db = AsyncMock()
    lineup = _lineup()
    result = await generate_landing_clip_for_lineup(
        db, lineup,
        chapter_start=0.0, chapter_end=30.0,
        video_path=None,  # missing!
        precomputed_result_ts=20.0,
    )
    assert result.status == "failed"
    assert "no_video_path_with_precomputed" in result.error_codes


@pytest.mark.asyncio
async def test_ingest_path_chapter_too_short_skips():
    """Even with a valid result_ts, a sliver chapter clamps below 1s → skip."""
    db = AsyncMock()
    lineup = _lineup()
    result = await generate_landing_clip_for_lineup(
        db, lineup,
        chapter_start=19.9, chapter_end=20.3,
        video_path=Path("/tmp/x.mp4"),
        precomputed_result_ts=20.0,
    )
    assert result.status == "skipped"
    assert result.skip_reason == "chapter_too_short_for_landing_clip"


# ---------------------------------------------------------------------------
# generate_landing_clip_for_lineup — backfill path (own classifier call)
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
        error_codes=[],
    )
    base.update(kw)
    return ThrowTimingResult(**base)


def _refined(
    *,
    timestamps: list[float] | None = None,
    stage: str = STAGE_REFINED,
    timing: ThrowTimingResult | None = None,
    **timing_kwargs,
) -> RefinedThrowTiming:
    """Mirrors test_clip_generator._refined — build a RefinedThrowTiming
    wrapper for landing_clip_generator's localize_throw_with_refinement
    mock. After the two-stage refactor, landing_clip_generator no longer
    calls clip_window_timestamps / extract_frames_downscaled /
    classify_throw_timing_from_frames directly; the orchestrator owns
    that chain. Tests therefore mock the orchestrator and shape its
    return as RefinedThrowTiming.
    """
    timing_obj = timing if timing is not None else _timing(**timing_kwargs)
    if timestamps is None:
        timestamps = [12.0, 18.0, 24.0, 30.0, 36.0]
    return RefinedThrowTiming(
        timing=timing_obj,
        frame_timestamps=timestamps,
        stage=stage,
        coarse_timing=timing_obj,
    )


@pytest.mark.asyncio
async def test_backfill_path_runs_classifier_and_generates():
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_url_mock = AsyncMock(return_value=lineup)
    timestamps = [12.0, 18.0, 24.0, 30.0, 36.0]

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(return_value=_refined(
                  timestamps=timestamps, result_index=5))),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_landing_clip_url", set_url_mock),
        patch(f"{_MOD}.cut_and_upload_wide_source",
              new=AsyncMock(return_value=_wide_fail())),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            # No precomputed → backfill branch.
        )

    assert result.status == "generated"
    # result_index 5 (1-based) → timestamps[4] = 36.0, then clamped end at 40.
    assert result.result_ts == pytest.approx(36.0)


@pytest.mark.asyncio
async def test_backfill_path_skips_not_a_throw():
    db = AsyncMock()
    lineup = _lineup()
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(return_value=_refined(
                  timestamps=[12.0, 18.0, 24.0], is_lineup_throw=False))),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "skipped"
    assert result.skip_reason == "not_a_throw"


@pytest.mark.asyncio
async def test_backfill_path_skips_low_confidence():
    db = AsyncMock()
    lineup = _lineup()
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(return_value=_refined(
                  timestamps=[12.0, 18.0, 24.0], confidence=0.4))),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "skipped"
    assert result.skip_reason.startswith("low_confidence")


@pytest.mark.asyncio
async def test_backfill_path_skips_no_result_frame():
    db = AsyncMock()
    lineup = _lineup()
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(return_value=_refined(
                  timestamps=[12.0, 18.0, 24.0], result_index=None))),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "skipped"
    assert result.skip_reason == "no_result_frame"


@pytest.mark.asyncio
async def test_backfill_path_classifier_disabled_skips():
    db = AsyncMock()
    lineup = _lineup()
    with patch(f"{_MOD}.settings", _settings(enable=False)):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "skipped"
    assert result.skip_reason == "classifier_disabled"


@pytest.mark.asyncio
async def test_backfill_path_classifier_missing_key_skips():
    db = AsyncMock()
    lineup = _lineup()
    with patch(f"{_MOD}.settings", _settings(key="")):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "skipped"
    assert "missing_api_key" in result.skip_reason


@pytest.mark.asyncio
async def test_backfill_path_classifier_api_failure_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    failed_timing = ThrowTimingResult(
        success=False, error_codes=["overloaded_error"],
        reasoning="rate limited",
    )
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(return_value=_refined(
                  timing=failed_timing, stage=STAGE_COARSE_FAILED,
                  timestamps=[]))),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "failed"
    assert "overloaded_error" in result.error_codes


@pytest.mark.asyncio
async def test_backfill_path_frame_extract_failure_returns_failed():
    """A coarse-pass FrameExtractionError is re-raised by the orchestrator
    so landing_clip_generator's existing structured-failure surface is
    unchanged."""
    db = AsyncMock()
    lineup = _lineup()
    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.localize_throw_with_refinement",
              AsyncMock(side_effect=FrameExtractionError(
                  "boom", timestamp=18.0, returncode=1, stderr="x",
              ))),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.status == "failed"
    assert any("frame_extract" in c for c in result.error_codes)


@pytest.mark.asyncio
async def test_backfill_path_download_failure_returns_failed(tmp_path):
    """When the generator owns the download (video_path=None), a yt-dlp
    failure surfaces as status=failed with structured codes (not a raise)."""
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
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=None,
            download_dir=tmp_path,
        )
    assert result.status == "failed"
    assert any("download:network" in c for c in result.error_codes)


@pytest.mark.asyncio
async def test_backfill_path_no_source_video_skips():
    db = AsyncMock()
    lineup = _lineup(video_id=None)
    result = await generate_landing_clip_for_lineup(
        db, lineup,
        chapter_start=0.0, chapter_end=30.0,
        video_path=Path("/tmp/x.mp4"),
    )
    assert result.status == "skipped"
    assert result.skip_reason == "no_source_video"


@pytest.mark.asyncio
async def test_ffmpeg_cut_failure_returns_failed():
    """Same failure shape on both ingest and backfill paths — assert via ingest."""
    db = AsyncMock()
    lineup = _lineup()

    with patch(
        f"{_MOD}.cut_clip",
        AsyncMock(side_effect=ClipCutError(
            "boom", start=20.0, duration=3.5, returncode=1, stderr="x",
        )),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
        )
    assert result.status == "failed"
    assert any("clip_cut" in c for c in result.error_codes)


@pytest.mark.asyncio
async def test_upload_failure_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    storage.upload_file = MagicMock(side_effect=RuntimeError("minio down"))

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
        )
    assert result.status == "failed"
    assert "clip_upload_failed" in result.error_codes


@pytest.mark.asyncio
async def test_persist_failure_returns_failed():
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.cut_and_upload_wide_source",
              new=AsyncMock(return_value=_wide_fail())),
        patch(
            f"{_MOD}.lineup_repo.set_landing_clip_url",
            AsyncMock(side_effect=RuntimeError("db down")),
        ),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
        )
    assert result.status == "failed"
    assert "landing_clip_url_persist_failed" in result.error_codes


# ---------------------------------------------------------------------------
# Wide-source wiring — mirrors test_clip_generator's TestGenerateClipWideSourceWiring
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_widen_source_persists_offsets_for_landing():
    """Happy wide path: landing tight is [24-0.5, 24+3.0] = [23.5, 3.5]; wide
    spans chapter + padding starting at source_start=10. set_landing_clip_url
    is called with source_key + the offset pair so the slider opens at the
    tight landing bounds within the wider source."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_url_mock = AsyncMock(return_value=lineup)

    wide = _wide_ok(
        source_start=10.0,
        source_duration=45.0,
        source_key="pending/vid123/10-landing-source.mp4",
    )

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_landing_clip_url", set_url_mock),
        patch(f"{_MOD}.cut_and_upload_wide_source",
              new=AsyncMock(return_value=wide)) as mock_wide,
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
            precomputed_confidence=0.82,
        )

    assert result.status == "generated"
    mock_wide.assert_awaited_once()
    wide_kwargs = mock_wide.await_args.kwargs
    assert wide_kwargs["chapter_start"] == 10.0
    assert wide_kwargs["chapter_end"] == 40.0
    assert (
        wide_kwargs["source_key"] == "pending/vid123/10-landing-source.mp4"
    )

    set_url_mock.assert_awaited_once()
    set_kwargs = set_url_mock.await_args.kwargs
    assert set_kwargs["source_key"] == "pending/vid123/10-landing-source.mp4"
    # Landing tight: clip_start=23.5, clip_duration=3.5; source_start=10
    # → trim_start_s = 23.5 - 10 = 13.5; trim_end_s = 23.5 + 3.5 - 10 = 17.0
    assert set_kwargs["trim_start_s"] == pytest.approx(13.5)
    assert set_kwargs["trim_end_s"] == pytest.approx(17.0)


@pytest.mark.asyncio
async def test_wide_failure_falls_back_to_legacy_landing_posture():
    """Wide failure leaves the row in the legacy posture — set_landing_clip_url
    is called with source_key=None so landing_clip_url_original equals
    landing_clip_url; the widen-source backfill can retry later."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_url_mock = AsyncMock(return_value=lineup)

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_landing_clip_url", set_url_mock),
        patch(f"{_MOD}.cut_and_upload_wide_source",
              new=AsyncMock(return_value=_wide_fail())),
    ):
        result = await generate_landing_clip_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_result_ts=24.0,
        )

    assert result.status == "generated"
    set_url_mock.assert_awaited_once()
    set_kwargs = set_url_mock.await_args.kwargs
    assert set_kwargs["source_key"] is None
    assert set_kwargs["trim_start_s"] is None
    assert set_kwargs["trim_end_s"] is None
