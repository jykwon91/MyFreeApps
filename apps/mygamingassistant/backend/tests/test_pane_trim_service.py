"""Unit tests for the per-pane clip-duration trim service (PR2).

Covers the pane allow-list (THROW + LANDING only), the schema-level duration
validation (min 1s / max 30s / start < end), source-key resolution (404 when
no clip exists for the pane), the (pane → setter) dispatch table, and the
ffmpeg-failure path (structured ClipCutError surfaces as a 500 with the
returncode context preserved).

No database, no MinIO, no ffmpeg — storage + ``cut_clip`` are patched with
async/sync stubs so we test the service logic, not the IO layer. Round-trip
correctness of the actual encode lives in the ingest integration tests.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.game.pane_trim_schemas import (
    MAX_TRIM_DURATION_S,
    MIN_TRIM_DURATION_S,
    PaneTrimRequest,
)
from app.services.game import pane_trim_service
from app.services.ingestion.frame_extractor import ClipCutError


# ---------------------------------------------------------------------------
# Schema-level validation — PaneTrimRequest catches the obvious shape bugs
# before the service ever runs. Asserting the model_validator here makes the
# rejection guarantee load-bearing for the route, not just an implementation
# detail of pydantic.
# ---------------------------------------------------------------------------


def test_request_rejects_end_at_or_before_start():
    with pytest.raises(ValueError, match="greater than"):
        PaneTrimRequest(start_offset_s=2.0, end_offset_s=2.0)
    with pytest.raises(ValueError, match="greater than"):
        PaneTrimRequest(start_offset_s=3.0, end_offset_s=1.5)


def test_request_rejects_duration_below_minimum():
    with pytest.raises(ValueError, match="below"):
        PaneTrimRequest(start_offset_s=0.0, end_offset_s=MIN_TRIM_DURATION_S - 0.01)


def test_request_rejects_duration_above_maximum():
    with pytest.raises(ValueError, match="exceeds"):
        PaneTrimRequest(start_offset_s=0.0, end_offset_s=MAX_TRIM_DURATION_S + 0.01)


def test_request_rejects_negative_start():
    with pytest.raises(ValueError):
        PaneTrimRequest(start_offset_s=-0.5, end_offset_s=2.0)


def test_request_accepts_min_duration_boundary():
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=MIN_TRIM_DURATION_S)
    assert body.end_offset_s - body.start_offset_s == MIN_TRIM_DURATION_S


def test_request_accepts_max_duration_boundary():
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=MAX_TRIM_DURATION_S)
    assert body.end_offset_s - body.start_offset_s == MAX_TRIM_DURATION_S


# ---------------------------------------------------------------------------
# trim_pane_clip — pane allow-list + source-key lookup + dispatch
# ---------------------------------------------------------------------------


def _make_lineup(
    lineup_id: uuid.UUID,
    *,
    clip_url: str | None = None,
    landing_clip_url: str | None = None,
) -> MagicMock:
    """ORM-like Lineup stub good enough for trim_pane_clip to dispatch.

    The setters expect attribute access via instance.clip_url / .landing_clip_url
    — MagicMock provides those automatically, but defaulting them to None
    explicitly matches the "no clip yet" case the service guards against.
    """
    lineup = MagicMock()
    lineup.id = lineup_id
    lineup.clip_url = clip_url
    lineup.landing_clip_url = landing_clip_url
    return lineup


@pytest.fixture
def patched_io():
    """Patch storage download/upload + cut_clip + _build_read.

    All four touchpoints are mocked so the service runs end-to-end against
    in-memory stubs and the test asserts on what the service DID (which IO
    it called, in what order, with what arguments), not on actual bytes.
    """
    with patch.object(pane_trim_service, "get_storage") as get_storage, \
         patch.object(pane_trim_service, "cut_clip", new_callable=AsyncMock) as cut, \
         patch.object(pane_trim_service, "_build_read") as build_read:
        storage = MagicMock()
        storage.download_file.return_value = b"source-clip-bytes"
        storage.upload_file.return_value = "ignored"
        get_storage.return_value = storage
        cut.return_value = b"trimmed-clip-bytes"
        build_read.side_effect = lambda lineup: {"id": str(lineup.id)}
        yield {"storage": storage, "cut": cut, "build_read": build_read}


@pytest.mark.asyncio
async def test_rejects_non_trimmable_pane(patched_io):
    """STAND and AIM are out of scope — must 400 with a useful message."""
    lineup = _make_lineup(uuid.uuid4(), clip_url="edits/old.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)
    for pane in ("stand", "aim"):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, pane, body)
        assert exc.value.status_code == 400
        assert "trimmable" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_404_when_pane_has_no_source_clip(patched_io):
    """Pane is trimmable but the lineup has never had a clip on that column."""
    lineup = _make_lineup(uuid.uuid4(), clip_url=None, landing_clip_url=None)
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)
    for pane in ("throw", "landing"):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, pane, body)
        assert exc.value.status_code == 404
        assert "no clip" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_throw_pane_writes_to_clip_url(patched_io):
    """THROW trim reads clip_url, cuts, uploads under edits/, sets clip_url."""
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id, clip_url="pending/abc/0-clip.mp4")
    body = PaneTrimRequest(start_offset_s=1.5, end_offset_s=4.5)

    set_clip_url = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url", set_clip_url):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    # cut_clip called with the correct start + (end - start) duration
    patched_io["cut"].assert_awaited_once()
    cut_kwargs = patched_io["cut"].await_args.kwargs
    assert cut_kwargs["start_seconds"] == pytest.approx(1.5)
    assert cut_kwargs["duration_seconds"] == pytest.approx(3.0)

    # The new key landed under edits/<lineup_id>/throw-clip-trim-<uuid>.mp4
    set_clip_url.assert_awaited_once()
    new_key = set_clip_url.await_args.args[2]
    assert new_key.startswith(f"edits/{lineup_id}/throw-clip-trim-")
    assert new_key.endswith(".mp4")


@pytest.mark.asyncio
async def test_landing_pane_writes_to_landing_clip_url(patched_io):
    """LANDING trim reads landing_clip_url and writes via set_landing_clip_url."""
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id, landing_clip_url="pending/abc/landing.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=3.0)

    set_landing = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_landing_clip_url", set_landing):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "landing", body)

    set_landing.assert_awaited_once()
    new_key = set_landing.await_args.args[2]
    assert new_key.startswith(f"edits/{lineup_id}/landing-clip-trim-")


@pytest.mark.asyncio
async def test_uses_correct_source_key_for_download(patched_io):
    """The download must use the existing column's key, not anything else.

    Regression guard: if a future refactor mixes up the (pane → reader)
    dispatch this catches it — we'd download the wrong column's bytes.
    """
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(
        lineup_id,
        clip_url="pending/throw-key.mp4",
        landing_clip_url="pending/landing-key.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_landing = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_landing_clip_url", set_landing):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "landing", body)
    patched_io["storage"].download_file.assert_called_once_with("pending/landing-key.mp4")


@pytest.mark.asyncio
async def test_ffmpeg_failure_surfaces_as_500_with_returncode(patched_io):
    """A ClipCutError must NOT silent-fail — it surfaces as 500 with rc."""
    patched_io["cut"].side_effect = ClipCutError(
        "ffmpeg exited 1",
        start=0.0,
        duration=2.0,
        returncode=1,
        stderr="error: cannot decode",
    )

    lineup = _make_lineup(uuid.uuid4(), clip_url="pending/abc.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    with pytest.raises(HTTPException) as exc:
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 500
    # Surface the structured rc so operators correlating logs can find it.
    assert "rc=1" in exc.value.detail


@pytest.mark.asyncio
async def test_storage_download_failure_surfaces_as_502(patched_io):
    patched_io["storage"].download_file.side_effect = RuntimeError("minio down")

    lineup = _make_lineup(uuid.uuid4(), clip_url="pending/abc.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    with pytest.raises(HTTPException) as exc:
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 502
    assert "download" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_storage_upload_failure_surfaces_as_502(patched_io):
    patched_io["storage"].upload_file.side_effect = RuntimeError("bucket full")

    lineup = _make_lineup(uuid.uuid4(), clip_url="pending/abc.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_clip_url = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url", set_clip_url):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 502
    assert "upload" in exc.value.detail.lower()
    # set_clip_url should never have been called — upload failed first.
    set_clip_url.assert_not_called()


@pytest.mark.asyncio
async def test_temp_file_cleaned_up_on_success(patched_io, tmp_path, monkeypatch):
    """The temp source file holding downloaded bytes must be deleted.

    Regression guard for the disk-leak case where a long-lived worker runs
    hundreds of trims without restarting and accumulates GBs of orphans.
    """
    created_paths: list[str] = []

    real_named_tempfile = pane_trim_service.tempfile.NamedTemporaryFile

    def tracking_tempfile(*args, **kwargs):
        handle = real_named_tempfile(*args, **kwargs)
        created_paths.append(handle.name)
        return handle

    monkeypatch.setattr(
        pane_trim_service.tempfile, "NamedTemporaryFile", tracking_tempfile
    )

    lineup = _make_lineup(uuid.uuid4(), clip_url="pending/abc.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_clip_url = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url", set_clip_url):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    assert len(created_paths) == 1
    import pathlib
    assert not pathlib.Path(created_paths[0]).exists()


@pytest.mark.asyncio
async def test_trim_key_uniqueness(patched_io):
    """Two trims on the same lineup+pane produce distinct keys.

    Distinct keys preserve forensic copies and prevent any race where the
    second trim's upload would overwrite the first mid-flight.
    """
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id, clip_url="pending/abc.mp4")
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    keys: list[str] = []

    async def capture_key(db, l, key):
        keys.append(key)
        return l

    with patch.object(pane_trim_service, "set_clip_url", capture_key):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    assert len(keys) == 2
    assert keys[0] != keys[1]
