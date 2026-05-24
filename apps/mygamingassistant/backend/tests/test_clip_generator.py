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
    pending_clip_source_key,
)
from app.services.ingestion.frame_extractor import ClipCutError, FrameExtractionError
from app.services.ingestion.throw_localizer import (
    STAGE_COARSE_FAILED,
    STAGE_REFINED,
    RefinedThrowTiming,
)
from app.services.ingestion.wide_source import WideSourceResult
from app.services.ingestion.youtube_fetcher import VideoDownloadError

_MOD = "app.services.ingestion.clip_generator"
_FAKE_PNG = b"\x89PNG\r\n\x1a\n"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _wide_ok(source_start=0.0, source_duration=60.0, source_key="pending/vid/0-clip-source.mp4"):
    """A successful WideSourceResult for the cut_and_upload_wide_source mock."""
    return WideSourceResult(
        source_key=source_key,
        source_start_s=source_start,
        source_duration_s=source_duration,
    )


def _wide_fail():
    """A failed WideSourceResult — best-effort failure leaves the row in the
    legacy posture (clip_url_original = clip_url, NULL offsets)."""
    return WideSourceResult(error_codes=["wide_source_cut:rc=1"])


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
    def test_normal_window_anchored_on_release(self):
        # release 20, chapter [10,40]: [20-1, 20+1] = [19, 21] = 2.0s.
        # Anchored entirely on release_ts — the throw pane shows the MOTION
        # (windup + release + follow-through), not the bloom that follows
        # (the landing pane) and not the locked aim (the aim pane).
        start, dur = _compute_clip_bounds(20.0, 10.0, 40.0)
        assert start == pytest.approx(19.0)
        assert dur == pytest.approx(2.0)

    def test_clamped_to_chapter_start(self):
        # release 10.5 → 10.5-1=9.5 but chapter starts at 10 → clamp to 10.
        # Expected: [10, 11.5] = 1.5s.
        start, dur = _compute_clip_bounds(10.5, 10.0, 40.0)
        assert start == pytest.approx(10.0)
        assert dur == pytest.approx(1.5)

    def test_chapter_too_short_returns_none(self):
        # 0.5s chapter — clamped window is < _ABSOLUTE_MIN_CLIP_SECONDS → skip.
        assert _compute_clip_bounds(20.0, 20.0, 20.5) is None

    def test_clip_never_exceeds_chapter_end(self):
        # release near chapter_end → tail clamped to chapter_end.
        start, dur = _compute_clip_bounds(22.5, 10.0, 23.0)
        assert start + dur <= 23.0 + 1e-9


def test_pending_clip_key_is_deterministic():
    # Stable key per (video, chapter start) → backfill idempotency.
    assert pending_clip_key("abc", 42.0) == "pending/abc/42-clip.mp4"
    assert pending_clip_key("abc", 42.9) == "pending/abc/42-clip.mp4"


def test_pending_clip_source_key_is_deterministic_and_distinct():
    # Same idempotency contract as the tight key, distinct suffix so the
    # wide source and the tight clip coexist in MinIO.
    assert pending_clip_source_key("abc", 42.0) == "pending/abc/42-clip-source.mp4"
    assert pending_clip_source_key("abc", 42.9) == "pending/abc/42-clip-source.mp4"
    # Tight and wide must NEVER share a key — overwriting one would destroy
    # the other's bytes.
    assert pending_clip_key("abc", 42.0) != pending_clip_source_key("abc", 42.0)


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


def _refined(
    *,
    timestamps: list[float] | None = None,
    stage: str = STAGE_REFINED,
    timing: ThrowTimingResult | None = None,
    **timing_kwargs,
) -> RefinedThrowTiming:
    """Build a RefinedThrowTiming wrapper for the orchestrator's return.

    After the two-stage refactor, clip_generator calls
    ``localize_throw_with_refinement`` instead of running the timestamp /
    extract / classify chain itself. Tests therefore mock the orchestrator
    and shape its return as a RefinedThrowTiming. ``timing`` kwargs are
    forwarded to :func:`_timing`; ``timestamps`` is the list whose
    1-based indices the caller maps the release/result indices back to.

    Pass ``stage=STAGE_COARSE_*`` when the test wants to assert the
    coarse-fallback branch was taken; the wrapped ``timing`` should be a
    ThrowTimingResult shaped accordingly.
    """
    timing_obj = timing if timing is not None else _timing(**timing_kwargs)
    if timestamps is None:
        timestamps = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
    return RefinedThrowTiming(
        timing=timing_obj,
        frame_timestamps=timestamps,
        stage=stage,
        coarse_timing=timing_obj,
    )


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
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)) as mock_cut,
            patch(f"{_MOD}.get_storage", return_value=storage),
            patch(f"{_MOD}.download_video", new=AsyncMock()) as mock_dl,
            patch(f"{_MOD}.cut_and_upload_wide_source",
                  new=AsyncMock(return_value=_wide_fail())),
            patch(f"{_MOD}.lineup_repo.set_clip_url", new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                db, lineup, chapter_start=0.0, chapter_end=30.0,
                video_path=video,
            )

        assert result.status == "generated"
        assert result.clip_key == "pending/vid123/0-clip.mp4"
        mock_dl.assert_not_awaited()  # provided video reused, no re-fetch
        # ONE tight upload (wide is mocked out of the storage layer).
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
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[1.0, 2.0, 3.0, 4.0],
                      release_index=1, result_index=2))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.download_video", new=AsyncMock(return_value=fetched)) as mock_dl,
            patch(f"{_MOD}.cut_and_upload_wide_source",
                  new=AsyncMock(return_value=_wide_fail())),
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


class TestGenerateClipWideSourceWiring:
    """The widen-source upgrade: when the wide cut+upload succeeds, the
    persisted ``clip_url_original`` differs from ``clip_url`` and the trim
    offsets describe where the tight clip lives inside the wide source.
    When it fails, the row stays in the legacy posture so the operator's
    tight clip is unchanged. Both shapes route through ``set_clip_url``.
    """

    @pytest.mark.asyncio
    async def test_widened_source_persists_offsets(self, tmp_path: Path):
        """Happy path: tight is at [release-2, release+1]; wide spans the
        whole chapter + padding. set_clip_url is called with source_key +
        the offset pair so the slider opens at the tight bounds."""
        video = tmp_path / "v.mp4"
        video.write_bytes(b"src")
        wide = _wide_ok(
            source_start=0.0,
            source_duration=60.0,
            source_key="pending/vid123/0-clip-source.mp4",
        )

        with (
            patch(f"{_MOD}.settings", _settings()),
            # 6 frames spread across [9..24]; release_index=2 → release_ts=12.
            # _compute_clip_bounds anchors entirely on release_ts:
            # [12-1, 12+1] = [11, 13] = 2.0s. result_ts (18) is surfaced on
            # the result row but no longer influences the clip window.
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[9.0, 12.0, 15.0, 18.0, 21.0, 24.0],
                      release_index=2, result_index=4))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.cut_and_upload_wide_source",
                  new=AsyncMock(return_value=wide)) as mock_wide,
            patch(f"{_MOD}.lineup_repo.set_clip_url",
                  new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=video,
            )

        assert result.status == "generated"
        mock_wide.assert_awaited_once()
        wide_kwargs = mock_wide.await_args.kwargs
        assert wide_kwargs["chapter_start"] == 0.0
        assert wide_kwargs["chapter_end"] == 30.0
        assert wide_kwargs["source_key"] == "pending/vid123/0-clip-source.mp4"

        mock_set.assert_awaited_once()
        set_kwargs = mock_set.await_args.kwargs
        assert set_kwargs["source_key"] == "pending/vid123/0-clip-source.mp4"
        # tight bounds: clip_start=11, clip_duration=2.0; source_start=0
        # → trim_start_s = 11 - 0 = 11; trim_end_s = 11 + 2.0 - 0 = 13.0
        assert set_kwargs["trim_start_s"] == pytest.approx(11.0)
        assert set_kwargs["trim_end_s"] == pytest.approx(13.0)

    @pytest.mark.asyncio
    async def test_wide_failure_falls_back_to_legacy_posture(self, tmp_path: Path):
        """When the wide cut fails the tight clip MUST still be persisted —
        with source_key=None so the repo writes the legacy posture
        (clip_url_original = clip_url, NULL offsets) and the widen-source
        backfill can retry later. The whole call still returns 'generated'."""
        video = tmp_path / "v.mp4"
        video.write_bytes(b"src")

        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[1.0, 2.0, 3.0, 4.0],
                      release_index=1, result_index=2))),
            patch(f"{_MOD}.cut_clip", new=AsyncMock(return_value=_FAKE_MP4)),
            patch(f"{_MOD}.get_storage", return_value=MagicMock()),
            patch(f"{_MOD}.cut_and_upload_wide_source",
                  new=AsyncMock(return_value=_wide_fail())),
            patch(f"{_MOD}.lineup_repo.set_clip_url",
                  new=AsyncMock()) as mock_set,
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=video,
            )

        assert result.status == "generated"
        mock_set.assert_awaited_once()
        set_kwargs = mock_set.await_args.kwargs
        assert set_kwargs["source_key"] is None
        assert set_kwargs["trim_start_s"] is None
        assert set_kwargs["trim_end_s"] is None


class TestGenerateClipSkips:
    async def _skip(self, *, timing=None, settings=None, lineup=None, video=None):
        refined_return = _refined(
            timestamps=[1.0, 2.0, 3.0],
            timing=timing or _timing(),
        )
        with (
            patch(f"{_MOD}.settings", settings or _settings()),
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=refined_return)),
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
    async def test_low_conf_reported_before_missing_release(self, tmp_path: Path):
        """Frozen-contract gate order: when BOTH confidence<0.55 and
        release is absent, the (more actionable) low-confidence reason wins."""
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        result, _, _ = await self._skip(
            timing=_timing(release_index=None, confidence=0.4), video=v
        )
        assert result.status == "skipped"
        assert result.skip_reason.startswith("low_confidence")

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
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[20.0, 20.1, 20.2],
                      release_index=1, result_index=1))),
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
        # No-download-dir check happens BEFORE the orchestrator runs, so
        # nothing needs to be patched on the timing-localiser surface.
        with patch(f"{_MOD}.settings", _settings()):
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
        """The orchestrator re-raises a coarse-pass FrameExtractionError so
        the existing structured-failure surface is unchanged."""
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        exc = FrameExtractionError("boom", timestamp=5.0, returncode=1, stderr="e")
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(side_effect=exc)),
        ):
            result = await generate_clip_for_lineup(
                MagicMock(), _lineup(), chapter_start=0.0, chapter_end=30.0,
                video_path=v,
            )
        assert result.status == "failed"
        assert result.error_codes == ["frame_extract:rc=1"]

    @pytest.mark.asyncio
    async def test_throw_timing_call_failure(self, tmp_path: Path):
        """A coarse-pass classifier failure surfaces as
        RefinedThrowTiming(timing.success=False, stage=COARSE_FAILED) —
        the caller routes on timing.error_codes exactly as before."""
        v = tmp_path / "v.mp4"; v.write_bytes(b"x")
        failed_timing = ThrowTimingResult(
            success=False, error_codes=["rate_limit_error"],
            reasoning="rate limited",
        )
        with (
            patch(f"{_MOD}.settings", _settings()),
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timing=failed_timing, stage=STAGE_COARSE_FAILED,
                      timestamps=[]))),
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
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[1.0, 2.0, 3.0, 4.0],
                      release_index=1, result_index=2))),
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
            patch(f"{_MOD}.localize_throw_with_refinement",
                  new=AsyncMock(return_value=_refined(
                      timestamps=[1.0, 2.0, 3.0, 4.0],
                      release_index=1, result_index=2))),
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
