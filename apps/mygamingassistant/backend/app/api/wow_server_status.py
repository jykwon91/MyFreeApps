"""WoW Forever server status — PUBLIC, both serve-only and full-auth mode.

GET /wow/server-status?region=<us|eu|kr|tw>
GET /wow/server-status/history?region=<us|eu|kr|tw>

Returns the online/offline state of each Forever ruleset (Normal, PvP,
Roleplay, Roleplay PvP) for the requested region.  Responses are cached
server-side for ~60 s so individual visitors never hammer Blizzard directly.

The history is what the scheduled recorder stored (``record_wow_server_status``,
see ``app/services/wow/server_status/``): the last 7 days per ruleset, read
from Postgres — it never calls Blizzard.

Error semantics:
  - 400 — unknown region (not in allowlist)
  - 502 — Blizzard's API returned errors or could not be reached; this is
           explicitly NOT "servers are down" — the client must distinguish
           between upstream failure and "online: false" rulesets.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_server_status import ServerStatusRegion
from app.db.session import get_db
from app.schemas.wow.server_status import ServerStatusResponse
from app.schemas.wow.server_status_history import ServerStatusHistoryResponse
from app.services.wow.server_status import server_status_history_service
from app.services.wow.server_status_client import (
    ALLOWED_REGIONS,
    ServerStatusUpstreamError,
    get_region_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["wow"])

# The recorder writes at most every few minutes; a minute of browser cache costs nothing.
_HISTORY_CACHE_CONTROL = "public, max-age=60"


@router.get("/wow/server-status", response_model=ServerStatusResponse)
async def get_server_status(
    region: str = Query(default="us", description="Region slug: us, eu, kr, tw"),
) -> ServerStatusResponse:
    """Return the live Forever server status for *region*.

    - 400 if *region* is not in the allowlist.
    - 502 if Blizzard's status API could not be reached or returned errors.
      This is never reported as "servers offline" to clients — it means we
      couldn't get reliable data.
    """
    region = region.lower().strip()
    if region not in ALLOWED_REGIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown region {region!r}. Must be one of: {sorted(ALLOWED_REGIONS)}",
        )

    try:
        return await get_region_status(region)
    except ServerStatusUpstreamError as exc:
        logger.warning("server_status: upstream error for region=%s: %s", region, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach Blizzard's server status service. Try again shortly.",
        ) from exc


@router.get("/wow/server-status/history", response_model=ServerStatusHistoryResponse)
async def get_server_status_history(
    response: Response,
    region: ServerStatusRegion = Query(default="us", description="Region slug: us, eu, kr, tw"),
    db: AsyncSession = Depends(get_db),
) -> ServerStatusHistoryResponse:
    """The recorded status of each Forever ruleset in *region* over the last 7 days. Public."""
    response.headers["Cache-Control"] = _HISTORY_CACHE_CONTROL
    return await server_status_history_service.get_history(db, region)
