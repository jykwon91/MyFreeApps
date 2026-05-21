"""Lineup business-logic service.

Responsibilities:
- Generate presigned PUT URLs for screenshot uploads
- Generate presigned GET URLs for screenshot reads
- Orchestrate lineup create/update by delegating to lineup_repo
- Status transition validation (accept/hide)

ORM operations — including the commit/rollback transaction boundary — live
exclusively in lineup_repo. This service never imports AsyncSession for
mutation; it receives the session from the route handler and passes it
through. Routes must NOT commit: ``get_db`` does not auto-commit, so the
repo owns the commit so a single missing call can't silently lose writes
(the bug this module's history records: PATCH returning 200 then rolling
back on session close).
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional
from urllib.parse import unquote, urlsplit

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import (
    LineupFilters,
    accept_lineup,
    commit_classifier_run,
    create_lineup,
    get_lineup,
    hide_lineup,
    list_lineups,
    list_pending_lineups,
    update_lineup,
    zone_density,
)
from app.services.classification.classification_result import ClassificationResult
from app.services.classification.classifier_service import classify_lineup
from app.schemas.game.lineup_schemas import (
    LineupAcceptBody,
    LineupCreate,
    LineupIngestCreate,
    LineupPatch,
    LineupRead,
    PendingLineupsResponse,
    UploadUrlResponse,
)

# Presigned PUT URLs are valid for 15 minutes — enough time for the browser
# to complete the upload, short enough to reduce exposure on leaked URLs.
_UPLOAD_URL_TTL = timedelta(minutes=15)
# Presigned GET URLs for screenshots in card view — 24 hours so images stay
# visible without re-auth on reload.
_READ_URL_TTL = 24 * 3600  # seconds


def _screenshot_key(user_id: uuid.UUID, lineup_id: uuid.UUID, slot: str) -> str:
    """Build a deterministic MinIO object key for a screenshot slot.

    Format: <user_id>/<lineup_id>/<slot>.png
    Slot: "stand" or "aim"
    """
    return f"{user_id}/{lineup_id}/{slot}.png"


def generate_upload_urls(user_id: uuid.UUID) -> UploadUrlResponse:
    """Return presigned PUT URLs for stand and aim screenshots.

    The lineup_id is a new UUID generated here so the frontend can use it
    as the lineup ID when submitting the create request. This avoids a
    round-trip: client requests PUT URLs → uploads both files → POSTs the
    create with the known lineup_id.
    """
    storage = get_storage()
    lineup_id = uuid.uuid4()

    stand_key = _screenshot_key(user_id, lineup_id, "stand")
    aim_key = _screenshot_key(user_id, lineup_id, "aim")

    # minio-py presigned_put_object uses the internal client (same bucket,
    # same credentials). The URL host will be the MINIO_ENDPOINT value, which
    # is reachable by the browser in local dev (localhost:9000) and by the
    # container network in production.
    #
    # In production the browser needs the *public* endpoint. We sign against
    # the same client used for reads since presigned GET already handles the
    # dual-endpoint case via generate_presigned_url on _public_client.
    # For PUT we call the underlying minio client directly.
    #
    # _DualEndpointStorageClient wraps internal + public Minio instances.
    # We expose a generate_presigned_put_url helper that uses the public
    # client for signing so the browser URL resolves correctly.
    stand_url = _presigned_put(storage, stand_key)
    aim_url = _presigned_put(storage, aim_key)

    return UploadUrlResponse(
        lineup_id=lineup_id,
        stand_upload_url=stand_url,
        aim_upload_url=aim_url,
        stand_object_key=stand_key,
        aim_object_key=aim_key,
    )


def _presigned_put(storage, key: str) -> str:
    """Sign a PUT URL using the public MinIO client when available."""
    from platform_shared.core.storage import _DualEndpointStorageClient

    if isinstance(storage, _DualEndpointStorageClient):
        # Use the public-facing client so the browser can resolve the URL.
        return storage._public_client.presigned_put_object(
            storage.bucket, key, expires=_UPLOAD_URL_TTL
        )
    return storage._client.presigned_put_object(
        storage.bucket, key, expires=_UPLOAD_URL_TTL
    )


def _object_key_from_value(value: str) -> str:
    """Return the bare MinIO object key from a stored screenshot column value.

    Normally *value* is already a bare key (``pending/<vid>/<n>-stand.png`` or
    ``<user_id>/<lineup_id>/stand.png``) — the column's intended content.

    A historical bug (fixed alongside migration 0007) persisted a *presigned
    URL* into the key column: ``_sign_lineup`` assigned the signed URL back
    onto the ORM instance, and mutating flows (accept/patch/create) committed
    the request session, flushing that URL into the object-key column. Reads
    then signed the URL *again*, producing a URL whose "key" was a URL-encoded
    URL → 404 → broken image.

    This peels every URL layer so signing always receives the real key. It is
    idempotent for already-clean keys (returns them unchanged), so it doubles
    as defense-in-depth even after the data-repair migration runs.
    """
    seen = 0
    while value[:4].lower() == "http" and seen < 5:
        parts = urlsplit(value)
        if not parts.scheme or not parts.netloc:
            break
        # URL path is "/<bucket>/<key...>" — drop the leading bucket segment.
        path = parts.path.lstrip("/")
        _, _, key = path.partition("/")
        value = unquote(key or path)
        seen += 1
    return value


def _sign_screenshot_url(stored: Optional[str]) -> Optional[str]:
    """Return a presigned GET URL for the screenshot, or None if unset.

    Defensive: extracts the real object key first so a row whose column was
    corrupted with a presigned URL still resolves (and never double-signs).
    """
    if not stored:
        return None
    key = _object_key_from_value(stored)
    if not key:
        return None
    storage = get_storage()
    return storage.generate_presigned_url(key, expires_in_seconds=_READ_URL_TTL)


def _build_read(lineup: Lineup) -> LineupRead:
    """Serialize an ORM ``Lineup`` to ``LineupRead`` with signed screenshot URLs.

    CRITICAL: this never mutates the ORM instance. The previous implementation
    assigned the signed URL back onto ``lineup.stand_screenshot_url`` /
    ``.aim_screenshot_url``; because accept/patch/create commit the request
    session, that persisted the presigned URL into the object-key column,
    destroying the key and double-signing on every later read. Signing happens
    on the Pydantic model only — the ORM column keeps the bare key.
    """
    read = LineupRead.model_validate(lineup)
    return read.model_copy(
        update={
            "stand_screenshot_url": _sign_screenshot_url(read.stand_screenshot_url),
            "aim_screenshot_url": _sign_screenshot_url(read.aim_screenshot_url),
            "clip_url": _sign_screenshot_url(read.clip_url),
            "landing_clip_url": _sign_screenshot_url(read.landing_clip_url),
            "stand_clip_url": _sign_screenshot_url(read.stand_clip_url),
            "aim_clip_url": _sign_screenshot_url(read.aim_clip_url),
        }
    )


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    payload: LineupCreate,
    lineup_id: Optional[uuid.UUID] = None,
) -> LineupRead:
    """Create a lineup via the manual upload path.

    All classification fields are required. Status is always set to 'accepted'
    so the lineup appears in the library immediately.
    """
    stand_url = payload.stand_screenshot_key
    aim_url = payload.aim_screenshot_key

    data: dict = {
        "game_id": payload.game_id,
        "map_id": payload.map_id,
        "target_zone_id": payload.target_zone_id,
        "stand_zone_id": payload.stand_zone_id,
        "side": payload.side,
        "utility_type_id": payload.utility_type_id,
        "title": payload.title,
        "notes": payload.notes,
        "stand_screenshot_url": stand_url,
        "aim_screenshot_url": aim_url,
        "aim_anchor_x": payload.aim_anchor_x,
        "aim_anchor_y": payload.aim_anchor_y,
        "stand_anchor_x": payload.stand_anchor_x,
        "stand_anchor_y": payload.stand_anchor_y,
        "target_anchor_x": payload.target_anchor_x,
        "target_anchor_y": payload.target_anchor_y,
        "setup_seconds": payload.setup_seconds,
        "attribution_url": payload.attribution_url,
        "attribution_author": payload.attribution_author,
        "status": "accepted",
    }
    if lineup_id is not None:
        data["id"] = lineup_id

    lineup = await create_lineup(db, data)
    return _build_read(lineup)


async def create_from_ingestion(
    db: AsyncSession,
    payload: LineupIngestCreate,
) -> Lineup:
    """Create a lineup from the ingestion pipeline.

    Classification fields are nullable — the Claude classifier (PR 5) fills
    them in after this row is created. Status is always 'pending_review'.
    """
    data: dict = {
        "source_id": payload.source_id,
        "title": payload.title,
        "youtube_video_id": payload.youtube_video_id,
        "chapter_start_seconds": payload.chapter_start_seconds,
        "chapter_title": payload.chapter_title,
        "stand_screenshot_url": payload.stand_screenshot_url,
        "aim_screenshot_url": payload.aim_screenshot_url,
        "attribution_url": payload.attribution_url,
        "attribution_author": payload.attribution_author,
        "game_id": payload.game_id,
        "map_id": payload.map_id,
        # Classification fields left null (PR 5 fills these)
        "target_zone_id": None,
        "stand_zone_id": None,
        "utility_type_id": None,
        "side": None,
        "status": "pending_review",
    }
    lineup = await create_lineup(db, data)
    return lineup


async def get(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> LineupRead | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    return _build_read(lineup)


async def list_by_filters(
    db: AsyncSession,
    filters: LineupFilters,
) -> list[LineupRead]:
    lineups = await list_lineups(db, filters)
    return [_build_read(l) for l in lineups]


async def patch(
    db: AsyncSession,
    lineup_id: uuid.UUID,
    payload: LineupPatch,
) -> LineupRead | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    patch_data = payload.model_dump(exclude_unset=True)
    updated = await update_lineup(db, lineup, patch_data)
    return _build_read(updated)


async def hide(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> LineupRead | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    hidden = await hide_lineup(db, lineup)
    return _build_read(hidden)


async def get_pending(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    source_id: Optional[uuid.UUID] = None,
    confidence_max: Optional[float] = None,
    game_id: Optional[uuid.UUID] = None,
) -> PendingLineupsResponse:
    """Return paginated pending_review lineups with presigned screenshot URLs."""
    items, total = await list_pending_lineups(
        db,
        limit=limit,
        offset=offset,
        source_id=source_id,
        confidence_max=confidence_max,
        game_id=game_id,
    )
    return PendingLineupsResponse(
        items=[_build_read(l) for l in items],
        total=total,
        limit=limit,
        offset=offset,
    )


async def accept(
    db: AsyncSession,
    lineup_id: uuid.UUID,
    body: LineupAcceptBody,
) -> LineupRead | None:
    """Accept a pending lineup, applying optional overrides.

    Resolves suggested values as defaults, then applies overrides on top.
    Returns None if lineup not found.
    Raises ValueError if required classification fields are missing after merge.
    """
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None

    # Build the accepted field set: start with suggested values, apply overrides
    game_id = body.game_id or lineup.suggested_game_id or lineup.game_id
    map_id = body.map_id or lineup.suggested_map_id or lineup.map_id
    target_zone_id = body.target_zone_id or lineup.suggested_target_zone_id
    stand_zone_id = body.stand_zone_id or lineup.suggested_stand_zone_id
    side = body.side or lineup.suggested_side or lineup.side
    utility_type_id = body.utility_type_id or lineup.suggested_utility_type_id or lineup.utility_type_id

    # Validate all required fields present (DB CHECK constraint would catch this
    # but a clear error here is better UX).
    missing = [
        name
        for name, val in [
            ("target_zone_id", target_zone_id),
            ("stand_zone_id", stand_zone_id),
            ("side", side),
            ("utility_type_id", utility_type_id),
        ]
        if val is None
    ]
    if missing:
        raise ValueError(
            f"Cannot accept lineup: missing required fields: {', '.join(missing)}. "
            "Set them via classifier suggestions or provide them in the accept body."
        )

    overrides: dict = {
        "game_id": game_id,
        "map_id": map_id,
        "target_zone_id": target_zone_id,
        "stand_zone_id": stand_zone_id,
        "side": side,
        "utility_type_id": utility_type_id,
    }
    if body.title is not None:
        overrides["title"] = body.title
    if body.notes is not None:
        overrides["notes"] = body.notes
    if body.aim_anchor_x is not None:
        overrides["aim_anchor_x"] = body.aim_anchor_x
    if body.aim_anchor_y is not None:
        overrides["aim_anchor_y"] = body.aim_anchor_y
    if body.stand_anchor_x is not None:
        overrides["stand_anchor_x"] = body.stand_anchor_x
    if body.stand_anchor_y is not None:
        overrides["stand_anchor_y"] = body.stand_anchor_y
    if body.target_anchor_x is not None:
        overrides["target_anchor_x"] = body.target_anchor_x
    if body.target_anchor_y is not None:
        overrides["target_anchor_y"] = body.target_anchor_y
    if body.setup_seconds is not None:
        overrides["setup_seconds"] = body.setup_seconds

    updated = await accept_lineup(db, lineup, overrides)
    return _build_read(updated)


async def reclassify(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> ClassificationResult:
    """Re-run the Claude classifier on a single lineup and persist suggestions.

    ``classify_lineup`` writes suggested_* fields and flushes but, per its
    documented contract, leaves the commit to the caller (the ingestion
    orchestrator batches; the interactive route commits one). Commit
    ownership for the interactive path lives in the repo
    (``commit_classifier_run``) so the route stays free of any ORM/DB call.
    On classifier failure nothing was flushed worth keeping, so no commit.
    """
    result = await classify_lineup(db, lineup_id)
    if result.success:
        await commit_classifier_run(db)
    return result


async def get_zone_density(
    db: AsyncSession,
    map_id: uuid.UUID,
    side: Optional[str],
    utility_type_ids: list[uuid.UUID],
) -> dict[str, dict]:
    return await zone_density(db, map_id, side, utility_type_ids)
