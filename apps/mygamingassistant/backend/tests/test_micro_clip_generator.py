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
    ThrowTimingResult,
)
from app.services.ingestion.throw_localizer import RefinedThrowTiming
from app.services.ingestion.frame_extractor import (
    ClipCutError,
    FrameExtractionError,
)
from app.services.ingestion.micro_clip_generator import (
    _AIM_MICRO_CLIP_SECONDS,
    _AIM_PRE_RELEASE_SECONDS,
    _STAND_MICRO_CLIP_SECONDS,
    _compute_micro_bounds,
    _micro_clip_seconds_for_side,
    generate_micro_clips_for_lineup,
    pending_aim_clip_key,
    pending_stand_clip_key,
)
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.micro_clip_generator"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _lineup(
    video_id="vid123",
    chapter_title="B smoke",
    *,
    clip_url=None,
    clip_url_original=None,
):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_title=chapter_title,
        attribution_author=None,
        stand_clip_url=None,
        aim_clip_url=None,
        # Read by generate_micro_clips_for_lineup to decide whether
        # ``stand_clip_offset_s`` / ``aim_clip_offset_s`` can be computed.
        # PR1 of the STAND/AIM shift-window initiative.
        clip_url=clip_url,
        clip_url_original=clip_url_original,
    )


# ---------------------------------------------------------------------------
# _compute_micro_bounds — pure math
# ---------------------------------------------------------------------------

class TestComputeMicroBounds:
    def test_normal_window_aim(self):
        # AIM uses 1.0s: anchor 24, chapter [10,40]: [24, 25] = 1.0s.
        start, dur = _compute_micro_bounds(24.0, 10.0, 40.0, clip_seconds=1.0)
        assert start == pytest.approx(24.0)
        assert dur == pytest.approx(1.0)

    def test_normal_window_stand(self):
        # STAND uses 2.0s: anchor 24, chapter [10,40]: [24, 26] = 2.0s.
        start, dur = _compute_micro_bounds(24.0, 10.0, 40.0, clip_seconds=2.0)
        assert start == pytest.approx(24.0)
        assert dur == pytest.approx(2.0)

    def test_clamped_to_chapter_start(self):
        # anchor 9.5 (before start 10): start clamps to 10, duration 1.0.
        start, dur = _compute_micro_bounds(9.5, 10.0, 40.0, clip_seconds=1.0)
        assert start == pytest.approx(10.0)
        assert dur == pytest.approx(1.0)

    def test_clamped_to_chapter_end_tail(self):
        # anchor 39.7, chapter ends 40 → clip [39.7, 40] = 0.3s — too short.
        assert _compute_micro_bounds(39.7, 10.0, 40.0, clip_seconds=1.0) is None

    def test_clamped_tail_above_threshold_is_kept(self):
        # anchor 39.4, chapter ends 40 → [39.4, 40] = 0.6s, above 0.5s threshold.
        start, dur = _compute_micro_bounds(39.4, 10.0, 40.0, clip_seconds=1.0)
        assert start == pytest.approx(39.4)
        assert dur == pytest.approx(0.6)

    def test_stand_clamped_tail_still_2s_when_room(self):
        # STAND anchor 30, chapter ends 40 → [30, 32] = 2.0s (room for full window).
        start, dur = _compute_micro_bounds(30.0, 10.0, 40.0, clip_seconds=2.0)
        assert start == pytest.approx(30.0)
        assert dur == pytest.approx(2.0)

    def test_stand_clamped_to_chapter_end_when_no_room(self):
        # STAND anchor 39.0, chapter ends 40 → asks for [39, 41], clamps to 40 = 1.0s.
        # Above the 0.5s min so it's kept (1.0s STAND > original 1.0s AIM).
        start, dur = _compute_micro_bounds(39.0, 10.0, 40.0, clip_seconds=2.0)
        assert start == pytest.approx(39.0)
        assert dur == pytest.approx(1.0)

    def test_chapter_too_short_returns_none(self):
        # 0.4s chapter — clamped window < 0.5s → skip signal.
        assert _compute_micro_bounds(20.0, 19.9, 20.3, clip_seconds=1.0) is None

    def test_clip_never_exceeds_chapter_end(self):
        start, dur = _compute_micro_bounds(21.5, 10.0, 22.0, clip_seconds=1.0)
        assert start + dur <= 22.0 + 1e-9

    def test_start_equals_anchor_for_overlay_accuracy(self):
        """The first frame of the AIM clip MUST equal the anchor still —
        otherwise the persisted aim_anchor_x/y pixel coords don't apply."""
        start, _dur = _compute_micro_bounds(24.0, 10.0, 40.0, clip_seconds=1.0)
        assert start == pytest.approx(24.0)


class TestMicroClipSecondsForSide:
    """STAND is operator-tuned to 2s (was cutting off mid-stance at 1s);
    AIM stays at 1s. The asymmetry MUST be load-bearing per-side, not a
    single shared constant — losing the split here re-introduces the
    "STAND cuts off too soon" complaint."""

    def test_stand_is_two_seconds(self):
        assert _micro_clip_seconds_for_side("stand") == pytest.approx(2.0)
        assert _STAND_MICRO_CLIP_SECONDS == pytest.approx(2.0)

    def test_aim_is_one_second(self):
        assert _micro_clip_seconds_for_side("aim") == pytest.approx(1.0)
        assert _AIM_MICRO_CLIP_SECONDS == pytest.approx(1.0)

    def test_unknown_side_raises(self):
        with pytest.raises(ValueError, match="unknown micro-clip side"):
            _micro_clip_seconds_for_side("landing")


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
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
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
async def test_ingest_path_release_without_stand_is_wiring_bug():
    """release_ts set without stand_ts → caller error (both fail).

    Post-2026-05-23: the validation surface changed. AIM-without-STAND is
    not a meaningful ingest shape (the orchestrator always knows stand_idx
    when it knows release_ts), so this is the only mixed-precomputed case
    left that's a true wiring bug. STAND-without-RELEASE is now a normal
    partial-ingest case (clip generation skipped/failed; AIM skips cleanly).
    """
    db = AsyncMock()
    lineup = _lineup()
    result = await generate_micro_clips_for_lineup(
        db, lineup,
        chapter_start=10.0, chapter_end=40.0,
        video_path=Path("/tmp/x.mp4"),
        precomputed_stand_ts=None,  # missing!
        precomputed_release_ts=24.8,
    )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "precomputed_pair_mismatch" in result.stand_error_codes
    assert "precomputed_pair_mismatch" in result.aim_error_codes


@pytest.mark.asyncio
async def test_ingest_path_stand_only_generates_stand_skips_aim():
    """precomputed_stand_ts set, precomputed_release_ts None → STAND
    generates from grid; AIM is skipped with no_release_ts_for_aim.

    This is the partial-ingest case: the orchestrator's THROW clip step
    skipped or failed, so release_ts is not available. STAND still
    benefits from the grid pass (which is reliable for STAND) — refusing
    AIM is preferable to faking it with the previously-random grid aim_idx.
    """
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            precomputed_release_ts=None,
        )

    assert result.stand_status == "generated"
    assert result.aim_status == "skipped"
    assert result.aim_skip_reason == "no_release_ts_for_aim"
    set_stand_mock.assert_awaited_once()
    set_aim_mock.assert_not_awaited()


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
        # AIM_TS = release_ts - 0.8 = 20.1
        precomputed_release_ts=20.1 + _AIM_PRE_RELEASE_SECONDS,
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


def _refined(release_ts=30.8, **kw):
    """Build a RefinedThrowTiming with the given release_ts.

    Sets up so the throw_localizer mock returns release_index=1 +
    frame_timestamps=[release_ts] — caller-side ``release_ts =
    frame_timestamps[release_index - 1]`` resolves to the wanted value.
    """
    timing = ThrowTimingResult(
        success=True,
        is_lineup_throw=True,
        release_index=1,
        result_index=1,
        confidence=0.9,
        reasoning="ok",
        error_codes=[],
    )
    base = dict(
        timing=timing,
        frame_timestamps=[release_ts],
        stage="refined",
        coarse_timing=None,
    )
    base.update(kw)
    return RefinedThrowTiming(**base)


def _localizer_mock(refined=None, **refined_kw):
    """Mock for localize_throw_with_refinement. AsyncMock returning ``refined``."""
    if refined is None:
        refined = _refined(**refined_kw)
    return AsyncMock(return_value=refined)


@pytest.mark.asyncio
async def test_backfill_path_runs_classifier_and_generates():
    """Backfill runs grid (stand) + throw_localizer (release → aim) and
    generates both clips. STAND from grid_timestamps[stand_idx]; AIM from
    release_ts − _AIM_PRE_RELEASE_SECONDS."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)
    grid = _grid(best_stand_index=2)
    timestamps = [12.0, 18.0, 24.0, 30.0, 36.0]
    # release_ts = 36.8 → AIM_TS = 36.0
    refined = _refined(release_ts=36.0 + _AIM_PRE_RELEASE_SECONDS)

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 5)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
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
    # AIM = release_ts (36.8) − 0.8 = 36.0.
    assert result.stand_ts == pytest.approx(18.0)
    assert result.aim_ts == pytest.approx(36.0)


@pytest.mark.asyncio
async def test_backfill_path_grid_not_a_lineup_skips_stand_but_aim_independent():
    """Grid says not_a_lineup → STAND skips. Throw localizer still runs
    independently (it's a separate Claude pass with its own decision).
    Here we let throw_localizer succeed → AIM still generates."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_aim_mock = AsyncMock(return_value=lineup)
    grid = _grid(is_lineup=False, best_stand_index=None, best_aim_index=None)
    timestamps = [12.0, 18.0, 24.0]
    refined = _refined(release_ts=22.0 + _AIM_PRE_RELEASE_SECONDS)

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "skipped"
    assert result.stand_skip_reason == "backfill_not_a_lineup"
    assert result.aim_status == "generated"
    assert result.aim_ts == pytest.approx(22.0)


@pytest.mark.asyncio
async def test_backfill_path_throw_localizer_no_release_skips_aim_but_stand_independent():
    """Throw localizer says not-a-throw / no release → AIM skips cleanly.
    Grid still runs independently — STAND still generates."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    grid = _grid(best_stand_index=2)
    timestamps = [12.0, 18.0, 24.0]
    not_a_throw = ThrowTimingResult(
        success=True, is_lineup_throw=False,
        release_index=None, result_index=None,
        confidence=0.1, reasoning="no throw", error_codes=[],
    )
    refined = _refined(release_ts=99.0)
    refined.timing = not_a_throw

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "generated"
    assert result.stand_ts == pytest.approx(18.0)
    assert result.aim_status == "skipped"
    assert result.aim_skip_reason == "backfill_no_throw_release"


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
async def test_backfill_path_grid_classifier_api_failure_fails_stand_aim_independent():
    """Grid call fails (overloaded) → STAND fails with the structured code.
    Throw localizer is separate; here it succeeds and AIM still generates."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_aim_mock = AsyncMock(return_value=lineup)
    grid = ClassificationResult(
        success=False, error_codes=["overloaded_error"],
        reasoning="rate limited",
    )
    timestamps = [12.0, 18.0, 24.0]
    refined = _refined(release_ts=22.0 + _AIM_PRE_RELEASE_SECONDS)

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert "overloaded_error" in result.stand_error_codes
    assert result.aim_status == "generated"


@pytest.mark.asyncio
async def test_backfill_path_both_classifiers_fail_returns_both_failed():
    """When BOTH the grid call and the throw localizer fail with API errors,
    both sides fail with structured codes (no fabrication)."""
    db = AsyncMock()
    lineup = _lineup()
    grid = ClassificationResult(
        success=False, error_codes=["overloaded_error"],
        reasoning="rate limited",
    )
    bad_timing = ThrowTimingResult(
        success=False, error_codes=["rate_limit_error"],
        reasoning="rate limited",
    )
    refined = RefinedThrowTiming(
        timing=bad_timing,
        frame_timestamps=[],
        stage="coarse_failed",
        coarse_timing=bad_timing,
    )
    timestamps = [12.0, 18.0, 24.0]

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(f"{_MOD}.extract_frames",
              AsyncMock(return_value=[_FAKE_PNG] * 3)),
        patch(f"{_MOD}.classify_frames_for_lineup_decision",
              AsyncMock(return_value=grid)),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "overloaded_error" in result.stand_error_codes
    assert "rate_limit_error" in result.aim_error_codes


@pytest.mark.asyncio
async def test_backfill_path_grid_frame_extract_failure_fails_stand_only():
    """Grid extract fails → STAND fails; throw_localizer is independent.
    Here the localizer succeeds → AIM generates."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_aim_mock = AsyncMock(return_value=lineup)
    timestamps = [12.0, 18.0, 24.0]
    refined = _refined(release_ts=22.0 + _AIM_PRE_RELEASE_SECONDS)

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_MOD}.grid_timestamps", return_value=timestamps),
        patch(
            f"{_MOD}.extract_frames",
            AsyncMock(side_effect=FrameExtractionError(
                "boom", timestamp=18.0, returncode=1, stderr="x",
            )),
        ),
        patch(f"{_MOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert any("frame_extract" in c for c in result.stand_error_codes)
    assert result.aim_status == "generated"


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
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
        )

    assert result.stand_status == "failed"
    assert result.aim_status == "generated", (
        "Aim side must not regress when stand cut fails — the two columns "
        "are independent."
    )
    set_stand_mock.assert_not_awaited()
    set_aim_mock.assert_awaited_once()


# ---------------------------------------------------------------------------
# Stand/Aim shift offset persistence — PR1 (STAND/AIM shift-window)
# ---------------------------------------------------------------------------


def _offset_kwarg(call):
    """Pull ``offset_s`` out of a mock setter call, accepting either keyword
    or positional binding. The production caller passes ``offset_s=`` as a
    kwarg per the setter signature; this helper exists so tests aren't
    brittle to that convention drifting."""
    if "offset_s" in call.kwargs:
        return call.kwargs["offset_s"]
    return None


@pytest.mark.asyncio
async def test_offset_persisted_when_wider_source_exists():
    """clip_url_original != clip_url → shared wider source exists.

    The micro generator must compute ``offset_s = clip_start - source_start``
    using the same wide_source_bounds settings clip_generator used (PRE/POST
    from settings.clip_source_pre/post_seconds), and pass it to the setters
    so the PR2 shift-window editor opens at the right initial position.
    """
    db = AsyncMock()
    # Wider source covers [chapter_start - PRE, chapter_end + POST] = [10-PRE, 40+POST].
    # The test patches settings to make PRE/POST deterministic regardless of
    # whatever the real config carries.
    lineup = _lineup(
        clip_url="pending/vid123/10-clip.mp4",
        clip_url_original="pending/vid123/10-clip-source.mp4",
    )
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    fake_settings = MagicMock()
    fake_settings.clip_source_pre_seconds = 2.0
    fake_settings.clip_source_post_seconds = 4.0

    with (
        patch(f"{_MOD}.settings", fake_settings),
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,  # → offset 12 - (10 - 2) = 4.0
            # AIM_TS = release_ts - 0.8 = 30.0; → offset 30 - 8 = 22.0
            precomputed_release_ts=30.0 + _AIM_PRE_RELEASE_SECONDS,
        )

    stand_call = set_stand_mock.await_args
    aim_call = set_aim_mock.await_args
    assert _offset_kwarg(stand_call) == pytest.approx(4.0), (
        "STAND offset must equal clip_start - wider_source_start "
        "(12.0 - (10.0 - 2.0) = 4.0). "
        f"Got setter call: args={stand_call.args} kwargs={stand_call.kwargs}"
    )
    assert _offset_kwarg(aim_call) == pytest.approx(22.0), (
        "AIM offset must equal clip_start - wider_source_start "
        "(30.0 - 8.0 = 22.0). "
        f"Got setter call: args={aim_call.args} kwargs={aim_call.kwargs}"
    )


@pytest.mark.asyncio
async def test_offset_not_persisted_when_no_wider_source():
    """clip_url_original is None → no shared wider source.

    The setter must be called with ``offset_s=None`` so the existing
    ``stand_clip_offset_s`` / ``aim_clip_offset_s`` columns are left
    untouched (NULL stays NULL for legacy rows).
    """
    db = AsyncMock()
    lineup = _lineup(clip_url=None, clip_url_original=None)
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
        )

    assert _offset_kwarg(set_stand_mock.await_args) is None
    assert _offset_kwarg(set_aim_mock.await_args) is None


@pytest.mark.asyncio
async def test_offset_not_persisted_when_original_matches_clip():
    """clip_url_original == clip_url → wide-source cut failed at ingest.

    clip_generator falls back to ``*_url_original = *_url`` when the wider
    cut fails — same posture as a row without a wider source. Treat it as
    NO wider source and leave the offsets NULL.
    """
    db = AsyncMock()
    lineup = _lineup(
        clip_url="pending/vid123/10-clip.mp4",
        clip_url_original="pending/vid123/10-clip.mp4",  # same as clip_url
    )
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    with (
        patch(f"{_MOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
    ):
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_stand_ts=12.0,
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
        )

    assert _offset_kwarg(set_stand_mock.await_args) is None
    assert _offset_kwarg(set_aim_mock.await_args) is None


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
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
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
            # AIM_TS = release_ts - _AIM_PRE_RELEASE_SECONDS (0.8) = 24.0
            precomputed_release_ts=24.0 + _AIM_PRE_RELEASE_SECONDS,
        )
    # Storage down → both sides fail (same underlying fault per side).
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "clip_upload_failed" in result.stand_error_codes
    assert "clip_upload_failed" in result.aim_error_codes
