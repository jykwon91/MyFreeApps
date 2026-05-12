"""Lineup business-logic service.

Responsibilities:
- Generate presigned PUT URLs for screenshot uploads
- Generate presigned GET URLs for screenshot reads
- Orchestrate lineup create/update by delegating to lineup_repo
- Status transition validation (accept/hide)

ORM operations live exclusively in lineup_repo. This service never
imports AsyncSession directly — it receives it from the route handler.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.storage import get_storage
from app.models.game.lineup import Lineup
from app.repositories.game.lineup_repo import (
    LineupFilters,
    create_lineup,
    get_lineup,
    hide_lineup,
    list_lineups,
    update_lineup,
    zone_density,
)
from app.schemas.game.lineup_schemas import LineupCreate, LineupPatch, UploadUrlResponse

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


def _sign_screenshot_url(key: Optional[str]) -> Optional[str]:
    """Return a presigned GET URL for *key*, or None if key is falsy."""
    if not key:
        return None
    storage = get_storage()
    return storage.generate_presigned_url(key, expires_in_seconds=_READ_URL_TTL)


def _sign_lineup(lineup: Lineup) -> Lineup:
    """Mutate lineup's screenshot URL fields to presigned GET URLs in-place.

    The DB stores object keys (e.g. ``<user_id>/<lineup_id>/stand.png``).
    Callers receive presigned URLs valid for 24 h.
    """
    lineup.stand_screenshot_url = _sign_screenshot_url(lineup.stand_screenshot_url)
    lineup.aim_screenshot_url = _sign_screenshot_url(lineup.aim_screenshot_url)
    return lineup


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    payload: LineupCreate,
    lineup_id: Optional[uuid.UUID] = None,
) -> Lineup:
    """Create a lineup. status='accepted' for manual uploads (no review step)."""
    if settings.minio_skip_startup_check:
        # Local dev with MinIO disabled — store keys as-is (no signing)
        stand_url = payload.stand_screenshot_key
        aim_url = payload.aim_screenshot_key
    else:
        # Validate that the keys exist in MinIO (optional — removes orphan rows)
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
        "setup_seconds": payload.setup_seconds,
        "attribution_url": payload.attribution_url,
        "attribution_author": payload.attribution_author,
        "status": "accepted",
    }
    if lineup_id is not None:
        data["id"] = lineup_id

    lineup = await create_lineup(db, data)
    return _sign_lineup(lineup)


async def get(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> Lineup | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    return _sign_lineup(lineup)


async def list_by_filters(
    db: AsyncSession,
    filters: LineupFilters,
) -> list[Lineup]:
    lineups = await list_lineups(db, filters)
    return [_sign_lineup(l) for l in lineups]


async def patch(
    db: AsyncSession,
    lineup_id: uuid.UUID,
    payload: LineupPatch,
) -> Lineup | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    patch_data = payload.model_dump(exclude_unset=True)
    updated = await update_lineup(db, lineup, patch_data)
    return _sign_lineup(updated)


async def hide(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> Lineup | None:
    lineup = await get_lineup(db, lineup_id)
    if lineup is None:
        return None
    hidden = await hide_lineup(db, lineup)
    return hidden


async def get_zone_density(
    db: AsyncSession,
    map_id: uuid.UUID,
    side: Optional[str],
    utility_type_ids: list[uuid.UUID],
) -> dict[str, dict]:
    return await zone_density(db, map_id, side, utility_type_ids)
