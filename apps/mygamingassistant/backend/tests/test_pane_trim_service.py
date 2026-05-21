"""Unit tests for the per-pane clip-duration trim service.

PR2 shipped the destructive shape (cut from ``clip_url``, write to
``clip_url``); PR4 made trim reversible by cutting from preserved
``*_url_original`` and persisting via the trim-only setters. These tests
exercise the PR4 contract:

  * pane allow-list (THROW + LANDING only)
  * schema-level duration validation (min 1s / max 30s / start < end)
  * source-key resolution: prefer ``*_url_original``; fall back to ``*_url``
    only as defense-in-depth for any row the 0015 backfill somehow missed;
    404 only when BOTH columns are NULL
  * dispatch to the matching trim-only setter, with offsets persisted
  * widen-past-previous-trim case: two consecutive trims both cut from the
    same source (the second trim's start can be earlier than the first
    trim's start — exactly what was unbuildable in PR2)
  * ffmpeg-failure path (structured ClipCutError surfaces as a 500 with the
    returncode context preserved)

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
    clip_url_original: str | None = None,
    landing_clip_url: str | None = None,
    landing_clip_url_original: str | None = None,
) -> MagicMock:
    """ORM-like Lineup stub good enough for trim_pane_clip to dispatch.

    The trim-only setters expect attribute access via instance.clip_url /
    .clip_url_original / .landing_clip_url / .landing_clip_url_original —
    MagicMock provides those automatically, but defaulting them to None
    explicitly matches the "no clip yet" case the service guards against.
    """
    lineup = MagicMock()
    lineup.id = lineup_id
    lineup.clip_url = clip_url
    lineup.clip_url_original = clip_url_original
    lineup.landing_clip_url = landing_clip_url
    lineup.landing_clip_url_original = landing_clip_url_original
    return lineup


@pytest.fixture
def patched_io():
    """Patch storage download/upload + cut_clip + _build_admin_read.

    All four touchpoints are mocked so the service runs end-to-end against
    in-memory stubs and the test asserts on what the service DID (which IO
    it called, in what order, with what arguments), not on actual bytes.
    """
    with patch.object(pane_trim_service, "get_storage") as get_storage, \
         patch.object(pane_trim_service, "cut_clip", new_callable=AsyncMock) as cut, \
         patch.object(pane_trim_service, "_build_admin_read") as build_read:
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
    lineup = _make_lineup(
        uuid.uuid4(),
        clip_url="edits/old.mp4",
        clip_url_original="edits/old.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)
    for pane in ("stand", "aim"):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, pane, body)
        assert exc.value.status_code == 400
        assert "trimmable" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_404_when_pane_has_no_source_clip(patched_io):
    """Pane is trimmable but the lineup has never had a clip on that column.

    Both ``*_url`` and ``*_url_original`` are NULL — there is genuinely
    nothing to trim. (A pane with a non-NULL ``*_url`` but NULL
    ``*_url_original`` is a legacy/missed-backfill row and falls into the
    fallback path; see test_falls_back_to_legacy_url_when_original_missing.)
    """
    lineup = _make_lineup(uuid.uuid4())
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)
    for pane in ("throw", "landing"):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, pane, body)
        assert exc.value.status_code == 404
        assert "no clip" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_throw_pane_cuts_from_original_and_persists_offsets(patched_io):
    """THROW trim reads clip_url_original, cuts, persists key + offsets.

    PR4 invariant: the source is ALWAYS clip_url_original, never the
    previously-trimmed clip_url. The trim-only setter receives the new key
    AND the offset pair so the editor can pre-fill thumbs next time.
    """
    lineup_id = uuid.uuid4()
    # The current clip is already a previous trim; the source is the full
    # original. We expect the download to use the original, not the trim.
    lineup = _make_lineup(
        lineup_id,
        clip_url="edits/abc/throw-clip-trim-prev.mp4",
        clip_url_original="pending/abc/0-clip.mp4",
    )
    body = PaneTrimRequest(start_offset_s=1.5, end_offset_s=4.5)

    set_clip_url_trim = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url_trim", set_clip_url_trim):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    # Source download must be the ORIGINAL, never the previously-trimmed key.
    patched_io["storage"].download_file.assert_called_once_with("pending/abc/0-clip.mp4")

    # cut_clip called with the correct start + (end - start) duration
    patched_io["cut"].assert_awaited_once()
    cut_kwargs = patched_io["cut"].await_args.kwargs
    assert cut_kwargs["start_seconds"] == pytest.approx(1.5)
    assert cut_kwargs["duration_seconds"] == pytest.approx(3.0)

    # set_clip_url_trim is called with (db, lineup, new_key, start, end)
    set_clip_url_trim.assert_awaited_once()
    args = set_clip_url_trim.await_args.args
    assert args[1] is lineup
    new_key = args[2]
    assert new_key.startswith(f"edits/{lineup_id}/throw-clip-trim-")
    assert new_key.endswith(".mp4")
    assert args[3] == pytest.approx(1.5)
    assert args[4] == pytest.approx(4.5)


@pytest.mark.asyncio
async def test_landing_pane_cuts_from_original_and_persists_offsets(patched_io):
    """LANDING trim reads landing_clip_url_original; writes via the trim setter."""
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(
        lineup_id,
        landing_clip_url="edits/abc/landing-clip-trim-prev.mp4",
        landing_clip_url_original="pending/abc/landing.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.5, end_offset_s=3.5)

    set_landing_trim = AsyncMock(return_value=lineup)
    with patch.object(
        pane_trim_service, "set_landing_clip_url_trim", set_landing_trim
    ):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "landing", body)

    patched_io["storage"].download_file.assert_called_once_with("pending/abc/landing.mp4")
    set_landing_trim.assert_awaited_once()
    args = set_landing_trim.await_args.args
    new_key = args[2]
    assert new_key.startswith(f"edits/{lineup_id}/landing-clip-trim-")
    assert args[3] == pytest.approx(0.5)
    assert args[4] == pytest.approx(3.5)


@pytest.mark.asyncio
async def test_consecutive_trims_both_cut_from_same_source(patched_io):
    """Re-trimming is reversible — both cuts use clip_url_original.

    This is the PR4 promise that PR2 could not deliver: the operator can
    widen a previously-trimmed clip. We confirm by running two trims on the
    same lineup and asserting both downloads were the original, never the
    intermediate trim.
    """
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(
        lineup_id,
        clip_url="edits/abc/throw-clip-trim-first.mp4",
        clip_url_original="pending/abc/0-clip.mp4",
    )

    # First trim: a narrow window in the middle of the source
    body_narrow = PaneTrimRequest(start_offset_s=2.0, end_offset_s=4.0)
    # Second trim: starts EARLIER than the first trim — would have been
    # impossible under PR2's destructive shape.
    body_wider = PaneTrimRequest(start_offset_s=0.5, end_offset_s=5.0)

    set_clip_url_trim = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url_trim", set_clip_url_trim):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body_narrow)
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body_wider)

    # Both downloads must be the original — never the intermediate trim.
    download_calls = patched_io["storage"].download_file.call_args_list
    assert len(download_calls) == 2
    assert all(c.args[0] == "pending/abc/0-clip.mp4" for c in download_calls)

    # Second trim's start IS earlier than the first trim's start — the
    # widen-past-previous-bounds case the PR4 model enables.
    second_call_start = set_clip_url_trim.await_args_list[1].args[3]
    first_call_start = set_clip_url_trim.await_args_list[0].args[3]
    assert second_call_start < first_call_start


@pytest.mark.asyncio
async def test_falls_back_to_legacy_url_when_original_missing(patched_io):
    """Defense-in-depth: a row missed by the 0015 backfill still trims.

    The backfill copies clip_url -> clip_url_original for every pre-existing
    row, so this case shouldn't arise. But if it does, refusing to trim a
    clearly-trimmable clip would be worse UX than honoring the destructive
    PR2 shape one last time — the next ``set_clip_url`` (Replace) will
    populate the original column and restore the PR4 reversibility.
    """
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(
        lineup_id,
        clip_url="pending/abc/legacy.mp4",  # set
        clip_url_original=None,  # missing — fallback should kick in
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_clip_url_trim = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url_trim", set_clip_url_trim):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    patched_io["storage"].download_file.assert_called_once_with("pending/abc/legacy.mp4")
    set_clip_url_trim.assert_awaited_once()


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

    lineup = _make_lineup(
        uuid.uuid4(),
        clip_url="pending/abc.mp4",
        clip_url_original="pending/abc.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    with pytest.raises(HTTPException) as exc:
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 500
    # Surface the structured rc so operators correlating logs can find it.
    assert "rc=1" in exc.value.detail


@pytest.mark.asyncio
async def test_storage_download_failure_surfaces_as_502(patched_io):
    patched_io["storage"].download_file.side_effect = RuntimeError("minio down")

    lineup = _make_lineup(
        uuid.uuid4(),
        clip_url="pending/abc.mp4",
        clip_url_original="pending/abc.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    with pytest.raises(HTTPException) as exc:
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 502
    assert "download" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_storage_upload_failure_surfaces_as_502(patched_io):
    patched_io["storage"].upload_file.side_effect = RuntimeError("bucket full")

    lineup = _make_lineup(
        uuid.uuid4(),
        clip_url="pending/abc.mp4",
        clip_url_original="pending/abc.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_clip_url_trim = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url_trim", set_clip_url_trim):
        with pytest.raises(HTTPException) as exc:
            await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 502
    assert "upload" in exc.value.detail.lower()
    # set_clip_url_trim should never have been called — upload failed first.
    set_clip_url_trim.assert_not_called()


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

    lineup = _make_lineup(
        uuid.uuid4(),
        clip_url="pending/abc.mp4",
        clip_url_original="pending/abc.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    set_clip_url_trim = AsyncMock(return_value=lineup)
    with patch.object(pane_trim_service, "set_clip_url_trim", set_clip_url_trim):
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
    lineup = _make_lineup(
        lineup_id,
        clip_url="pending/abc.mp4",
        clip_url_original="pending/abc.mp4",
    )
    body = PaneTrimRequest(start_offset_s=0.0, end_offset_s=2.0)

    keys: list[str] = []

    async def capture_key(db, l, key, start, end):
        keys.append(key)
        return l

    with patch.object(pane_trim_service, "set_clip_url_trim", capture_key):
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)
        await pane_trim_service.trim_pane_clip(AsyncMock(), lineup, "throw", body)

    assert len(keys) == 2
    assert keys[0] != keys[1]
