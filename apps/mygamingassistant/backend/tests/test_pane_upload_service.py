"""Unit tests for the per-pane Replace upload service (PR1).

Covers the validation surface (pane/kind combination, MIME allow-list, size
caps), the deterministic key-naming under ``edits/<lineup_id>/``, the
``object_key`` tamper guard at confirm time, and the
(pane, kind) → repo-setter dispatch table.

No database — repo setters and the MinIO storage client are both patched
with simple stubs so the test asserts the service logic, not the IO layer.
"""
from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.game.pane_upload_schemas import (
    MAX_CLIP_BYTES,
    MAX_STILL_BYTES,
    PaneConfirmRequest,
    PaneUploadUrlRequest,
)
from app.services.game import pane_upload_service


# ---------------------------------------------------------------------------
# request_upload_url — validation + key naming
# ---------------------------------------------------------------------------


@pytest.fixture
def patched_storage():
    """Patch get_storage + _presigned_put so request_upload_url is IO-free."""
    with patch.object(pane_upload_service, "get_storage") as get_storage, \
         patch.object(pane_upload_service, "_presigned_put") as presign:
        storage = MagicMock()
        get_storage.return_value = storage
        presign.return_value = "https://minio.test/presigned-put"
        yield {"storage": storage, "presign": presign}


def test_request_upload_url_happy_path_stand_still(patched_storage):
    lineup_id = uuid.uuid4()
    body = PaneUploadUrlRequest(
        kind="still", content_type="image/png", content_length=1024
    )
    resp = pane_upload_service.request_upload_url(lineup_id, "stand", body)

    assert resp.upload_url == "https://minio.test/presigned-put"
    assert resp.object_key.startswith(f"edits/{lineup_id}/stand-still-")
    assert resp.object_key.endswith(".png")
    patched_storage["presign"].assert_called_once()


def test_request_upload_url_happy_path_throw_clip(patched_storage):
    lineup_id = uuid.uuid4()
    body = PaneUploadUrlRequest(
        kind="clip", content_type="video/mp4", content_length=2_000_000
    )
    resp = pane_upload_service.request_upload_url(lineup_id, "throw", body)
    assert resp.object_key.startswith(f"edits/{lineup_id}/throw-clip-")
    assert resp.object_key.endswith(".mp4")


def test_request_upload_url_rejects_still_on_throw_pane(patched_storage):
    """THROW pane has no still column; uploading a still must 400."""
    body = PaneUploadUrlRequest(
        kind="still", content_type="image/png", content_length=1024
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "throw", body)
    assert exc.value.status_code == 400
    assert "throw" in exc.value.detail.lower()


def test_request_upload_url_rejects_still_on_landing_pane(patched_storage):
    body = PaneUploadUrlRequest(
        kind="still", content_type="image/png", content_length=1024
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "landing", body)
    assert exc.value.status_code == 400


def test_request_upload_url_rejects_bad_content_type_for_still(patched_storage):
    body = PaneUploadUrlRequest(
        kind="still", content_type="application/octet-stream", content_length=1024
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "stand", body)
    assert exc.value.status_code == 400


def test_request_upload_url_rejects_bad_content_type_for_clip(patched_storage):
    body = PaneUploadUrlRequest(
        kind="clip", content_type="image/png", content_length=1024
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "stand", body)
    assert exc.value.status_code == 400


def test_request_upload_url_rejects_oversize_still(patched_storage):
    body = PaneUploadUrlRequest(
        kind="still", content_type="image/png", content_length=MAX_STILL_BYTES + 1
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "stand", body)
    assert exc.value.status_code == 413


def test_request_upload_url_rejects_oversize_clip(patched_storage):
    body = PaneUploadUrlRequest(
        kind="clip", content_type="video/mp4", content_length=MAX_CLIP_BYTES + 1
    )
    with pytest.raises(HTTPException) as exc:
        pane_upload_service.request_upload_url(uuid.uuid4(), "throw", body)
    assert exc.value.status_code == 413


def test_request_upload_url_key_uniqueness(patched_storage):
    """Same inputs yield distinct keys (uuid suffix) so retries don't overwrite."""
    lineup_id = uuid.uuid4()
    body = PaneUploadUrlRequest(
        kind="still", content_type="image/png", content_length=1024
    )
    r1 = pane_upload_service.request_upload_url(lineup_id, "stand", body)
    r2 = pane_upload_service.request_upload_url(lineup_id, "stand", body)
    assert r1.object_key != r2.object_key


# ---------------------------------------------------------------------------
# confirm_upload — tamper guard + dispatch
# ---------------------------------------------------------------------------


def _make_lineup(lineup_id: uuid.UUID) -> MagicMock:
    """Build an ORM-like Lineup stub good enough for confirm_upload to dispatch."""
    lineup = MagicMock()
    lineup.id = lineup_id
    lineup.stand_screenshot_url = None
    lineup.aim_screenshot_url = None
    lineup.stand_clip_url = None
    lineup.aim_clip_url = None
    lineup.clip_url = None
    lineup.landing_clip_url = None
    return lineup


@pytest.fixture
def patched_confirm_io():
    """Patch storage + _build_admin_read for the confirm-path tests.

    Replace returns the admin shape so the client's Trim editor can re-bind
    its slider to the new ``*_url_original`` without a second round-trip
    (PR4 pane-editor model).
    """
    with patch.object(pane_upload_service, "get_storage") as get_storage, \
         patch.object(pane_upload_service, "_build_admin_read") as build_read:
        storage = MagicMock()
        storage.object_exists.return_value = True
        get_storage.return_value = storage
        build_read.side_effect = lambda lineup: {"id": str(lineup.id)}
        yield {"storage": storage, "build_read": build_read}


@pytest.mark.asyncio
async def test_confirm_upload_rejects_foreign_object_key(patched_confirm_io):
    lineup_id = uuid.uuid4()
    other_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id)
    body = PaneConfirmRequest(
        kind="still",
        object_key=f"edits/{other_id}/stand-still-xx.png",
    )
    with pytest.raises(HTTPException) as exc:
        await pane_upload_service.confirm_upload(AsyncMock(), lineup, "stand", body)
    assert exc.value.status_code == 400
    assert "prefix" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_confirm_upload_404_when_object_missing(patched_confirm_io):
    patched_confirm_io["storage"].object_exists.return_value = False

    lineup_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id)
    body = PaneConfirmRequest(
        kind="still",
        object_key=f"edits/{lineup_id}/stand-still-xx.png",
    )
    with pytest.raises(HTTPException) as exc:
        await pane_upload_service.confirm_upload(AsyncMock(), lineup, "stand", body)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_confirm_upload_dispatches_to_correct_setter_per_pane_kind(
    patched_confirm_io,
):
    """The (pane, kind) → repo-setter dispatch must hit the right column.

    Walk every valid combination, patch the matching setter to record the call,
    confirm that one setter ran with the lineup + key and no other ran.
    """
    cases: list[tuple[str, str, str]] = [
        ("stand", "still", "set_stand_screenshot_url"),
        ("stand", "clip",  "set_stand_clip_url"),
        ("aim",   "still", "set_aim_screenshot_url"),
        ("aim",   "clip",  "set_aim_clip_url"),
        ("throw", "clip",  "set_clip_url"),
        ("landing", "clip", "set_landing_clip_url"),
    ]
    db_stub: Any = AsyncMock()

    for pane, kind, expected_setter in cases:
        lineup_id = uuid.uuid4()
        lineup = _make_lineup(lineup_id)
        object_key = f"edits/{lineup_id}/{pane}-{kind}-aa.bin"
        body = PaneConfirmRequest(kind=kind, object_key=object_key)

        # Replace the dispatch table entry with an async mock for this iteration
        recorded: dict[str, Any] = {}

        async def mock_setter(db, lin, key, _r=recorded):
            _r["db"] = db
            _r["lineup"] = lin
            _r["key"] = key
            return lin

        original = pane_upload_service._SETTERS[(pane, kind)]
        pane_upload_service._SETTERS[(pane, kind)] = mock_setter
        try:
            await pane_upload_service.confirm_upload(db_stub, lineup, pane, body)
        finally:
            pane_upload_service._SETTERS[(pane, kind)] = original

        assert recorded["lineup"] is lineup, f"({pane},{kind}) wrong lineup"
        assert recorded["key"] == object_key, f"({pane},{kind}) wrong key"
        assert original.__name__ == expected_setter, (
            f"({pane},{kind}) dispatch table points at "
            f"{original.__name__}, expected {expected_setter}"
        )


@pytest.mark.asyncio
async def test_confirm_upload_rejects_invalid_pane_kind(patched_confirm_io):
    """A confirm with kind='still' on the throw pane must 400 the same way
    request_upload_url does — defense in depth even if the client somehow
    obtained a presigned URL for it."""
    lineup_id = uuid.uuid4()
    lineup = _make_lineup(lineup_id)
    body = PaneConfirmRequest(
        kind="still",
        object_key=f"edits/{lineup_id}/throw-still-xx.png",
    )
    with pytest.raises(HTTPException) as exc:
        await pane_upload_service.confirm_upload(AsyncMock(), lineup, "throw", body)
    assert exc.value.status_code == 400
