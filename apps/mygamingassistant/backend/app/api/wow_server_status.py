"""WoW Forever server status — PUBLIC, both serve-only and full-auth mode.

GET /wow/server-status?region=<us|eu|kr|tw>

Returns the online/offline state of each Forever ruleset (Normal, PvP,
Roleplay, Roleplay PvP) for the requested region.  Responses are cached
server-side for ~60 s so individual visitors never hammer Blizzard directly.

Error semantics:
  - 400 — unknown region (not in allowlist)
  - 502 — Blizzard's API returned errors or could not be reached; this is
           explicitly NOT "servers are down" — the client must distinguish
           between upstream failure and "online: false" rulesets.
"""
import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.wow.server_status import ServerStatusResponse
from app.services.wow.server_status_client import (
    ALLOWED_REGIONS,
    ServerStatusUpstreamError,
    get_region_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["wow"])


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
