"""Per-pane local-upload Replace service (PR1).

Implements the two-endpoint flow:

  1. ``request_upload_url(lineup, pane, request)`` validates the operator's
     intent, allocates a deterministic MinIO key, and returns a presigned PUT
     URL the browser uploads to directly. No DB write yet.

  2. ``confirm_upload(db, lineup, pane, request)`` verifies the object exists
     at the declared key and writes it onto the matching column via the
     appropriate repo setter (which owns its own one-column commit per PR
     #687/#695). Returns the refreshed ``LineupRead`` with the new presigned
     GET URL already attached.

The server never re-encodes — the operator renders the artifact locally with
whatever editor they prefer (ffmpeg, DaVinci, Premiere, ScreenStudio) and the
backend just records the new key. Source videos never need to live on the
server for editing purposes.
"""
from __future__ import annotations

import uuid
from typing import Callable, Awaitable

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import (
    set_aim_clip_url,
    set_aim_screenshot_url,
    set_clip_url,
    set_landing_clip_url,
    set_stand_clip_url,
    set_stand_screenshot_url,
)
from app.schemas.game.lineup_schemas import LineupRead
from app.schemas.game.pane_upload_schemas import (
    ALLOWED_CLIP_MIMES,
    ALLOWED_STILL_MIMES,
    Kind,
    MAX_CLIP_BYTES,
    MAX_STILL_BYTES,
    Pane,
    PaneConfirmRequest,
    PaneUploadUrlRequest,
    PaneUploadUrlResponse,
    VALID_PANE_KIND,
    _ext_for_content_type,
)
from app.services.game.lineup_service import _build_read, _presigned_put


# Operator setters indexed by (pane, kind). Each value is a coroutine taking
# (db, lineup, key) and committing one column — see lineup_repo for the
# transaction-ownership pattern. Keeping the dispatch table in service rather
# than the repo keeps the repo's existing per-column setters typed and
# discoverable (no untyped string columns leak through).
_PaneSetter = Callable[[AsyncSession, Lineup, str], Awaitable[Lineup]]

_SETTERS: dict[tuple[Pane, Kind], _PaneSetter] = {
    ("stand", "still"): set_stand_screenshot_url,
    ("stand", "clip"):  set_stand_clip_url,
    ("aim",   "still"): set_aim_screenshot_url,
    ("aim",   "clip"):  set_aim_clip_url,
    ("throw", "clip"):  set_clip_url,
    ("landing", "clip"): set_landing_clip_url,
}


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_pane_kind(pane: Pane, kind: Kind) -> None:
    """Reject invalid (pane, kind) combinations with a 400.

    THROW + LANDING are clip-only today (no still column exists). The matching
    pane primitive's text fallback covers the still slot for LANDING; THROW
    has no still slot at all (the THROW pane is the actual throw motion).
    """
    if (pane, kind) not in VALID_PANE_KIND:
        raise HTTPException(
            status_code=400,
            detail=f"pane '{pane}' does not accept kind '{kind}'",
        )


def _validate_content_type(kind: Kind, content_type: str) -> None:
    """Reject MIMEs outside the allow-list for the declared kind."""
    allowed = ALLOWED_STILL_MIMES if kind == "still" else ALLOWED_CLIP_MIMES
    if content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"content_type '{content_type}' not allowed for kind '{kind}' "
                f"(accepted: {sorted(allowed)})"
            ),
        )


def _validate_content_length(kind: Kind, content_length: int) -> None:
    """Reject files larger than the per-kind cap."""
    limit = MAX_STILL_BYTES if kind == "still" else MAX_CLIP_BYTES
    if content_length > limit:
        raise HTTPException(
            status_code=413,
            detail=(
                f"file size {content_length} exceeds {limit}-byte limit "
                f"for kind '{kind}'"
            ),
        )


# ---------------------------------------------------------------------------
# Key naming — operator-uploaded edits live under ``edits/`` so they never
# collide with auto-generated ingestion keys (``pending/<vid>/...``) or the
# manual-upload-create keys (``<user_id>/<lineup_id>/...``).
#
# A uuid suffix per upload makes each edit a distinct object (no overwrite),
# so the column always points at the latest while older keys remain available
# for forensic comparison. Disk cost is negligible at MGA scale; a cleanup job
# can prune unreferenced ``edits/`` keys later if it becomes meaningful.
# ---------------------------------------------------------------------------


def _build_edit_key(lineup_id: uuid.UUID, pane: Pane, kind: Kind, content_type: str) -> str:
    ext = _ext_for_content_type(content_type)
    return f"edits/{lineup_id}/{pane}-{kind}-{uuid.uuid4()}.{ext}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def request_upload_url(
    lineup_id: uuid.UUID,
    pane: Pane,
    request: PaneUploadUrlRequest,
) -> PaneUploadUrlResponse:
    """Validate the intended upload and return a presigned PUT URL.

    Synchronous — no DB read, no DB write. The lineup_id is taken from the
    path, never from the body, so an operator can't sign a URL for a different
    lineup than the one their browser tile is showing. We deliberately do NOT
    check that the lineup exists here: that check happens at ``confirm`` time
    where it matters, and skipping it now keeps the signing path fast and
    independent of database availability. A signed URL pointing at a non-
    existent lineup is harmless — the object just lands under an unused
    ``edits/<lineup_id>/`` prefix.
    """
    _validate_pane_kind(pane, request.kind)
    _validate_content_type(request.kind, request.content_type)
    _validate_content_length(request.kind, request.content_length)

    object_key = _build_edit_key(lineup_id, pane, request.kind, request.content_type)
    storage = get_storage()
    upload_url = _presigned_put(storage, object_key)

    return PaneUploadUrlResponse(upload_url=upload_url, object_key=object_key)


async def confirm_upload(
    db: AsyncSession,
    lineup: Lineup,
    pane: Pane,
    request: PaneConfirmRequest,
) -> LineupRead:
    """Validate the upload landed, then point the column at the new key.

    The route handler is responsible for resolving ``lineup`` from the path
    parameter before calling here (so a 404 surfaces cleanly without us
    duplicating the lookup). We re-validate (pane, kind) defensively in case
    a client mixed up the request body — surfaces a 400 with a useful message
    rather than silently writing to the wrong column.

    Object-key tampering: we reject any ``object_key`` that doesn't live under
    this lineup's ``edits/<lineup_id>/`` prefix. Without this guard a client
    could confirm someone else's just-uploaded blob into their own lineup.
    """
    _validate_pane_kind(pane, request.kind)

    expected_prefix = f"edits/{lineup.id}/"
    if not request.object_key.startswith(expected_prefix):
        raise HTTPException(
            status_code=400,
            detail=(
                f"object_key must live under '{expected_prefix}' "
                "(refusing to write a key from a different lineup's prefix)"
            ),
        )

    storage = get_storage()
    if not storage.object_exists(request.object_key):
        raise HTTPException(
            status_code=404,
            detail=(
                f"no uploaded object found at '{request.object_key}' — "
                "confirm the PUT completed before calling confirm"
            ),
        )

    setter = _SETTERS[(pane, request.kind)]
    updated = await setter(db, lineup, request.object_key)
    return _build_read(updated)
