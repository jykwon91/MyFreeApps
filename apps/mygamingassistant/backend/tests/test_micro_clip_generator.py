"""Unit tests for the PR6 stand + aim micro-clip generator.

Pure micro-bounds math + the full generate_micro_clips_for_lineup
orchestration with every external (download / throw-localizer Claude
call / ffmpeg cut / MinIO / repo commit) mocked. Asserts that both
STAND and AIM derive from a single release_ts (precomputed on ingest,
re-resolved by the throw-localizer on backfill) and the structured
per-side generated / skipped / failed outcomes.

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
    ThrowTimingResult,
)
from app.services.ingestion.throw_localizer import RefinedThrowTiming
from app.services.ingestion.frame_extractor import ClipCutError
from app.services.ingestion.micro_clip_generator import (
    _AIM_MICRO_CLIP_SECONDS,
    _STAND_MICRO_CLIP_SECONDS,
    _compute_micro_bounds,
    _micro_clip_seconds_for_side,
    generate_micro_clips_for_lineup,
    pending_aim_clip_key,
    pending_stand_clip_key,
)
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.micro_clip_generator"
# Most ffmpeg / storage / throw-localizer / repo calls now live in the
# sibling helpers module (PR #761 +). Patches that target those resolve
# here.
_HMOD = "app.services.ingestion.micro_clip_helpers"
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

    def test_start_equals_anchor(self):
        """``_compute_micro_bounds`` preserves the caller-supplied anchor as
        the clip start (unless clamped by chapter_start). Callers compose the
        semantic anchor (start / center / end) by choosing what they pass."""
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
    """Precomputed release_ts → skip throw-localizer; cut + upload + persist twice.

    Both STAND and AIM are content-localized via their own resolvers
    (mocked here to deterministic ``22.0`` / ``24.2``). See
    ``stand_timing_classifier`` and ``aim_timing_classifier`` for the
    live shapes.
    """
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    localizer_mock = AsyncMock()  # MUST NOT be called on ingest
    resolve_stand_mock = AsyncMock(return_value=(22.0, [], ""))
    resolve_aim_mock = AsyncMock(return_value=(24.2, [], ""))

    with (
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()) as cut,
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_HMOD}.localize_throw_with_refinement", localizer_mock),
        patch(f"{_MOD}._resolve_stand_ts", resolve_stand_mock),
        patch(f"{_MOD}._resolve_aim_ts", resolve_aim_mock),
    ):
        # release_ts = 25.0 → STAND_TS = mocked 22.0; AIM_TS = mocked 24.2.
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
        )

    assert result.stand_status == "generated"
    assert result.aim_status == "generated"
    assert result.stand_clip_key == "pending/vid123/10-stand-micro.mp4"
    assert result.aim_clip_key == "pending/vid123/10-aim-micro.mp4"
    assert result.stand_ts == pytest.approx(22.0)
    assert result.aim_ts == pytest.approx(24.2)
    assert cut.await_count == 2
    assert storage.upload_file.call_count == 2
    set_stand_mock.assert_awaited_once()
    set_aim_mock.assert_awaited_once()
    localizer_mock.assert_not_awaited(), (
        "Ingest path must NOT call the throw-localizer — cost regression"
    )


@pytest.mark.asyncio
async def test_ingest_path_no_release_ts_skips_both():
    """precomputed_release_ts=None → BOTH sides skip with no_release_ts.

    This is the partial-ingest case: the orchestrator's THROW clip step
    skipped or failed, so release_ts is not available. Since STAND and
    AIM both bound their search windows on release_ts, neither can run —
    the panes render their stills instead. The earlier "STAND still
    generates from grid" behaviour is gone (the grid anchor was
    unreliable).
    """
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    localizer_mock = AsyncMock()  # MUST NOT be called
    resolve_stand_mock = AsyncMock()  # MUST NOT be called
    resolve_aim_mock = AsyncMock()  # MUST NOT be called

    with (
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_HMOD}.localize_throw_with_refinement", localizer_mock),
        patch(f"{_MOD}._resolve_stand_ts", resolve_stand_mock),
        patch(f"{_MOD}._resolve_aim_ts", resolve_aim_mock),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=None,
        )

    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "no_release_ts"
    assert result.aim_skip_reason == "no_release_ts"
    set_stand_mock.assert_not_awaited()
    set_aim_mock.assert_not_awaited()
    localizer_mock.assert_not_awaited(), (
        "Ingest must not re-run the throw-localizer when caller passed None"
    )
    resolve_stand_mock.assert_not_awaited()
    resolve_aim_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_ingest_path_chapter_too_short_skips_both():
    """A sliver chapter clamps below 0.5s → both sides skip."""
    db = AsyncMock()
    lineup = _lineup()
    # release_ts in middle of tiny chapter → both anchors clamp to start;
    # both clips clamp below the 0.5s minimum → both skip.
    # STAND + AIM localizers are content-aware (separate Claude calls) —
    # mock both to values inside the sliver chapter so each enters the
    # cut path and hits the chapter_too_short clamp.
    with (
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(20.1, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(20.1, [], ""))),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=19.9, chapter_end=20.3,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=20.1,
        )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "chapter_too_short_for_microclip"
    assert result.aim_skip_reason == "chapter_too_short_for_microclip"


# ---------------------------------------------------------------------------
# generate_micro_clips_for_lineup — backfill path (own throw-localizer call)
# ---------------------------------------------------------------------------

def _settings(enable=True, key="sk-test"):
    s = MagicMock()
    s.enable_classifier = enable
    s.anthropic_api_key = key
    return s


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
async def test_backfill_path_runs_throw_localizer_and_generates():
    """Backfill runs throw_localizer; STAND + AIM both content-localized
    (mocked here)."""
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)
    refined = _refined(release_ts=30.0)
    resolve_stand_mock = AsyncMock(return_value=(27.0, [], ""))
    resolve_aim_mock = AsyncMock(return_value=(29.4, [], ""))

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_HMOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}._resolve_stand_ts", resolve_stand_mock),
        patch(f"{_MOD}._resolve_aim_ts", resolve_aim_mock),
    ):
        # Omit precomputed_release_ts → sentinel default → backfill branch.
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
        )

    assert result.stand_status == "generated"
    assert result.aim_status == "generated"
    # release_ts 30.0; both panes content-localized: STAND=27.0, AIM=29.4.
    assert result.stand_ts == pytest.approx(27.0)
    assert result.aim_ts == pytest.approx(29.4)


@pytest.mark.asyncio
async def test_backfill_path_throw_localizer_no_release_skips_both():
    """Throw localizer says not-a-throw / no release → both sides skip.

    Since both panes share the same anchor source, a missing release_ts
    skips them together. The lineup still has its stills.
    """
    db = AsyncMock()
    lineup = _lineup()
    not_a_throw = ThrowTimingResult(
        success=True, is_lineup_throw=False,
        release_index=None, result_index=None,
        confidence=0.1, reasoning="no throw", error_codes=[],
    )
    refined = _refined(release_ts=99.0)
    refined.timing = not_a_throw

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_HMOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "skipped"
    assert result.aim_status == "skipped"
    assert result.stand_skip_reason == "backfill_no_throw_release"
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
async def test_backfill_path_throw_localizer_api_failure_fails_both():
    """Throw localizer call fails (API error) → both sides fail with the
    SAME structured codes (they share input)."""
    db = AsyncMock()
    lineup = _lineup()
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

    with (
        patch(f"{_MOD}.settings", _settings()),
        patch(f"{_HMOD}.localize_throw_with_refinement",
              _localizer_mock(refined=refined)),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=0.0, chapter_end=30.0,
            video_path=Path("/tmp/x.mp4"),
        )
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "rate_limit_error" in result.stand_error_codes
    assert "rate_limit_error" in result.aim_error_codes


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
    must leave aim_status='generated', not 'failed'.

    Both sides bound by the same release_ts, but the cut/upload/persist
    runs once per side — a downstream failure on one side must not
    propagate to the other.
    """
    db = AsyncMock()
    lineup = _lineup()
    storage = _storage_mock()
    set_stand_mock = AsyncMock(return_value=lineup)
    set_aim_mock = AsyncMock(return_value=lineup)

    # cut_clip raises on the first call (stand), succeeds on the second (aim).
    cut_side_effects = [
        ClipCutError("boom", start=22.0, duration=2.0, returncode=1, stderr="x"),
        _FAKE_MP4,
    ]

    async def cut_clip_impl(*args, **kwargs):
        outcome = cut_side_effects.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    with (
        patch(f"{_HMOD}.cut_clip", AsyncMock(side_effect=cut_clip_impl)),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(22.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(24.2, [], ""))),
    ):
        # release_ts = 25.0 → STAND_TS = mocked 22.0; AIM_TS = mocked 24.2
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
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
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(12.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(14.2, [], ""))),
    ):
        # release_ts = 15.0; STAND_TS = mocked 12.0; AIM_TS = mocked 14.2.
        # STAND is CENTERED:  clip_start = 12.0 - 1.0 = 11.0  (half-window 1.0s)
        # AIM   is END-ANCHORED: clip_start = 14.2 - 1.0 = 13.2  (clip ends at aim_ts)
        # wider_source_start = 10 - 2 = 8.0.
        #   STAND offset = 11.0 - 8.0 = 3.0
        #   AIM   offset = 13.2 - 8.0 = 5.2
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=15.0,
        )

    stand_call = set_stand_mock.await_args
    aim_call = set_aim_mock.await_args
    assert _offset_kwarg(stand_call) == pytest.approx(3.0), (
        "STAND offset must equal clip_start - wider_source_start. "
        "STAND clip is CENTERED on stand_ts: clip_start = "
        "stand_ts - _STAND_HALF_CLIP_SECONDS (1.0) = 12.0 - 1.0 = 11.0. "
        "wider_source_start = chapter_start - PRE = 10.0 - 2.0 = 8.0. "
        "offset = 11.0 - 8.0 = 3.0. "
        f"Got setter call: args={stand_call.args} kwargs={stand_call.kwargs}"
    )
    assert _offset_kwarg(aim_call) == pytest.approx(5.2), (
        "AIM offset must equal clip_start - wider_source_start. "
        "AIM clip is END-ANCHORED on aim_ts: clip_start = "
        "aim_ts - _AIM_MICRO_CLIP_SECONDS (1.0) = 14.2 - 1.0 = 13.2. "
        "wider_source_start = 8.0. offset = 13.2 - 8.0 = 5.2. "
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
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(22.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(24.2, [], ""))),
    ):
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
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
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.lineup_repo.set_stand_clip_url", set_stand_mock),
        patch(f"{_MOD}.lineup_repo.set_aim_clip_url", set_aim_mock),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(22.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(24.2, [], ""))),
    ):
        await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
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
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(
            f"{_MOD}.lineup_repo.set_stand_clip_url",
            AsyncMock(side_effect=RuntimeError("db down")),
        ),
        patch(
            f"{_MOD}.lineup_repo.set_aim_clip_url",
            AsyncMock(return_value=lineup),
        ),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(22.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(24.2, [], ""))),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
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
        patch(f"{_HMOD}.cut_clip", _ffmpeg_cut_mock()),
        patch(f"{_HMOD}.get_storage", return_value=storage),
        patch(f"{_MOD}._resolve_stand_ts", AsyncMock(return_value=(22.0, [], ""))),
        patch(f"{_MOD}._resolve_aim_ts", AsyncMock(return_value=(24.2, [], ""))),
    ):
        result = await generate_micro_clips_for_lineup(
            db, lineup,
            chapter_start=10.0, chapter_end=40.0,
            video_path=Path("/tmp/x.mp4"),
            precomputed_release_ts=25.0,
        )
    # Storage down → both sides fail (same underlying fault per side).
    assert result.stand_status == "failed"
    assert result.aim_status == "failed"
    assert "clip_upload_failed" in result.stand_error_codes
    assert "clip_upload_failed" in result.aim_error_codes
