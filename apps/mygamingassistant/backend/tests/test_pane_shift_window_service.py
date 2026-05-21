"""Unit tests for the STAND/AIM per-pane shift-window service.

Mirrors :mod:`test_pane_trim_service` (download → cut → upload pipeline) and
:mod:`test_pane_widen_source_service` (pane validation + admin-shape return)
since this service is the fixed-width sibling of both.

The shift flow re-cuts the served 1-second STAND/AIM micro-clip at the
operator's chosen ``offset_s`` inside the shared wider source
``clip_url_original`` (the same column the throw trim editor reads from —
micro panes reuse the chapter's wider source rather than keeping per-pane
originals).
"""
from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.game.pane_shift_window_schemas import PaneShiftWindowRequest
from app.services.game import pane_shift_window_service
from app.services.game.pane_shift_window_service import shift_pane_window
from app.services.ingestion.frame_extractor import ClipCutError, ProbeError

_MOD = "app.services.game.pane_shift_window_service"
_FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42"


def _lineup(
    *,
    clip_url="pending/vid123/10-clip.mp4",
    clip_url_original="pending/vid123/10-clip-source.mp4",
    chapter_start_seconds=10,
    youtube_video_id="vid123",
):
    """ORM-like Lineup stub with the columns shift_pane_window reads.

    Defaults reflect a "shiftable" row — wider source present and distinct
    from the served clip. Each test overrides only what it needs.
    """
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        title="t",
        status="accepted",
        youtube_video_id=youtube_video_id,
        chapter_start_seconds=chapter_start_seconds,
        chapter_title="B smoke",
        clip_url=clip_url,
        clip_url_original=clip_url_original,
        # Fields _build_admin_read reads (we patch _build_admin_read in
        # most tests, but listing them keeps the stub self-documenting).
        clip_trim_start_s=None,
        clip_trim_end_s=None,
        landing_clip_url=None,
        landing_clip_url_original=None,
        landing_clip_trim_start_s=None,
        landing_clip_trim_end_s=None,
        stand_screenshot_url=None,
        aim_screenshot_url=None,
        stand_clip_url=None,
        aim_clip_url=None,
        stand_clip_offset_s=None,
        aim_clip_offset_s=None,
    )


def _storage_mock(download_bytes: bytes = _FAKE_MP4):
    storage = MagicMock()
    storage.download_file = MagicMock(return_value=download_bytes)
    storage.upload_file = MagicMock()
    return storage


@pytest.fixture
def patched_pipeline():
    """Patch the heavy externals — storage + ffprobe + cut + persist + build_read.

    Yields a dict of the relevant mocks so individual tests can configure
    return values / side effects + assert call shape.
    """
    storage = _storage_mock()
    set_stand = AsyncMock(side_effect=lambda db, lineup, key, **kw: lineup)
    set_aim = AsyncMock(side_effect=lambda db, lineup, key, **kw: lineup)
    build_read = MagicMock(side_effect=lambda lineup: f"admin_read({lineup.id})")

    with (
        patch(f"{_MOD}.get_storage", return_value=storage),
        patch(f"{_MOD}.probe_duration", AsyncMock(return_value=10.0)) as probe,
        patch(f"{_MOD}.cut_clip", AsyncMock(return_value=_FAKE_MP4)) as cut,
        patch(f"{_MOD}.set_stand_clip_url", set_stand),
        patch(f"{_MOD}.set_aim_clip_url", set_aim),
        patch(f"{_MOD}._build_admin_read", build_read),
    ):
        yield {
            "storage": storage,
            "probe": probe,
            "cut": cut,
            "set_stand": set_stand,
            "set_aim": set_aim,
            "build_read": build_read,
        }


# ---------------------------------------------------------------------------
# Validation guards
# ---------------------------------------------------------------------------


class TestValidation:
    @pytest.mark.asyncio
    async def test_rejects_pane_outside_shiftable_allow_list(self):
        """THROW + LANDING use the variable-width trim path; the shift
        endpoint must reject them with a 400 explaining the routing."""
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "throw", body)
        assert exc_info.value.status_code == 400
        assert "cannot be shifted" in exc_info.value.detail

        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "landing", body)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_rejects_when_no_wider_source(self):
        """clip_url_original is None → 409 telling the operator to widen first."""
        body = PaneShiftWindowRequest(offset_s=2.0)
        lineup = _lineup(clip_url_original=None)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), lineup, "stand", body)
        assert exc_info.value.status_code == 409
        assert "widen source" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_rejects_when_original_equals_served(self):
        """clip_url_original == clip_url → ingest fell back to the legacy
        posture (no wider source available). Same 409 as 'never widened'."""
        body = PaneShiftWindowRequest(offset_s=2.0)
        lineup = _lineup(
            clip_url="pending/vid/0-clip.mp4",
            clip_url_original="pending/vid/0-clip.mp4",  # same!
        )
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), lineup, "aim", body)
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_pydantic_rejects_negative_offset(self):
        """Schema-level guard — never reach the service for offset < 0."""
        with pytest.raises(Exception):  # pydantic.ValidationError
            PaneShiftWindowRequest(offset_s=-0.5)

    @pytest.mark.asyncio
    async def test_rejects_offset_past_source_duration(self, patched_pipeline):
        """Service-layer upper bound: offset + 1.0 must fit inside the
        actual wider source's probed duration. ffprobe returns 10.0s; a
        9.5s offset would leave only 0.5s of window — reject as 400."""
        patched_pipeline["probe"].return_value = 10.0
        body = PaneShiftWindowRequest(offset_s=9.5)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 400
        assert "1-second window" in exc_info.value.detail
        # cut_clip must NOT have been invoked — validation failed first.
        patched_pipeline["cut"].assert_not_awaited()
        patched_pipeline["set_stand"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_rejects_source_shorter_than_micro_clip(
        self, patched_pipeline,
    ):
        """A wider source shorter than 1.0s can't host the micro-clip.
        Shouldn't happen for any real chapter, but we guard rather than
        feeding ffmpeg a negative duration."""
        patched_pipeline["probe"].return_value = 0.5
        body = PaneShiftWindowRequest(offset_s=0.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 500
        assert "too short" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Happy path — stand and aim each end-to-end
# ---------------------------------------------------------------------------


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_stand_shift_cuts_uploads_and_persists(self, patched_pipeline):
        """End-to-end on the STAND pane.

        Pipeline contract:
          1. storage.download_file called with clip_url_original
          2. cut_clip called with start=offset, duration=1.0
          3. storage.upload_file called with the deterministic stand key
          4. set_stand_clip_url called with offset_s kwarg
          5. _build_admin_read called with the persisted lineup
        """
        body = PaneShiftWindowRequest(offset_s=3.0)
        lineup = _lineup()

        result = await shift_pane_window(MagicMock(), lineup, "stand", body)

        # Pipeline calls in order
        patched_pipeline["storage"].download_file.assert_called_once_with(
            lineup.clip_url_original,
        )
        patched_pipeline["probe"].assert_awaited_once()
        cut_call = patched_pipeline["cut"].await_args
        assert cut_call.kwargs["start_seconds"] == pytest.approx(3.0)
        assert cut_call.kwargs["duration_seconds"] == pytest.approx(1.0)

        # Upload key matches the deterministic stand pattern
        upload_call = patched_pipeline["storage"].upload_file.call_args
        new_key = upload_call.args[0]
        assert new_key == "pending/vid123/10-stand-micro.mp4", new_key

        # Persistence: stand setter only, with offset kwarg
        patched_pipeline["set_stand"].assert_awaited_once()
        set_call = patched_pipeline["set_stand"].await_args
        assert set_call.args[2] == new_key
        assert set_call.kwargs["offset_s"] == pytest.approx(3.0)
        patched_pipeline["set_aim"].assert_not_awaited()

        # Admin-shape returned
        patched_pipeline["build_read"].assert_called_once_with(lineup)
        assert result == f"admin_read({lineup.id})"

    @pytest.mark.asyncio
    async def test_aim_shift_uses_aim_setter_and_aim_key(self, patched_pipeline):
        """The AIM dispatch must go through set_aim_clip_url + the AIM key."""
        body = PaneShiftWindowRequest(offset_s=5.5)
        lineup = _lineup()

        await shift_pane_window(MagicMock(), lineup, "aim", body)

        patched_pipeline["set_aim"].assert_awaited_once()
        patched_pipeline["set_stand"].assert_not_awaited()
        new_key = patched_pipeline["storage"].upload_file.call_args.args[0]
        assert new_key == "pending/vid123/10-aim-micro.mp4", new_key
        assert (
            patched_pipeline["set_aim"].await_args.kwargs["offset_s"]
            == pytest.approx(5.5)
        )

    @pytest.mark.asyncio
    async def test_offset_zero_is_valid_and_persists(self, patched_pipeline):
        """Offset 0 means "start the window at the start of the wider source"
        — a legitimate operator choice (not a sentinel for NULL)."""
        body = PaneShiftWindowRequest(offset_s=0.0)
        lineup = _lineup()

        await shift_pane_window(MagicMock(), lineup, "stand", body)

        assert (
            patched_pipeline["set_stand"].await_args.kwargs["offset_s"]
            == pytest.approx(0.0)
        )

    @pytest.mark.asyncio
    async def test_max_offset_at_source_boundary_is_valid(
        self, patched_pipeline,
    ):
        """offset_s = source_duration - 1.0 exactly is at the boundary —
        the served clip's last frame is the wider source's last frame."""
        patched_pipeline["probe"].return_value = 9.0
        body = PaneShiftWindowRequest(offset_s=8.0)
        await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        patched_pipeline["cut"].assert_awaited_once()


# ---------------------------------------------------------------------------
# Failure modes through the pipeline
# ---------------------------------------------------------------------------


class TestFailureModes:
    @pytest.mark.asyncio
    async def test_download_failure_surfaces_502(self, patched_pipeline):
        patched_pipeline["storage"].download_file.side_effect = (
            RuntimeError("connection refused")
        )
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 502

    @pytest.mark.asyncio
    async def test_probe_failure_surfaces_500_with_context(
        self, patched_pipeline,
    ):
        patched_pipeline["probe"].side_effect = ProbeError(
            "ffprobe boom", returncode=1, stderr="bad mp4 header",
        )
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 500
        assert "ffprobe" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_cut_failure_surfaces_500_with_context(
        self, patched_pipeline,
    ):
        patched_pipeline["cut"].side_effect = ClipCutError(
            "boom", start=2.0, duration=1.0, returncode=2, stderr="bad codec",
        )
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 500
        assert "rc=2" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_upload_failure_surfaces_502(self, patched_pipeline):
        patched_pipeline["storage"].upload_file.side_effect = (
            RuntimeError("storage down")
        )
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 502
        # Persist must NOT have been called — upload failed first.
        patched_pipeline["set_stand"].assert_not_awaited()

    @pytest.mark.asyncio
    async def test_persist_failure_surfaces_500_after_upload(
        self, patched_pipeline,
    ):
        patched_pipeline["set_stand"].side_effect = RuntimeError("db down")
        body = PaneShiftWindowRequest(offset_s=2.0)
        with pytest.raises(HTTPException) as exc_info:
            await shift_pane_window(MagicMock(), _lineup(), "stand", body)
        assert exc_info.value.status_code == 500
        # Upload DID happen before the DB failure — that's the documented
        # ordering (object first, column second).
        patched_pipeline["storage"].upload_file.assert_called_once()
