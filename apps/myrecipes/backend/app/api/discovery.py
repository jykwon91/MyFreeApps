"""HTTP routes for recipe discovery — search the web, read one result.

Two routers, split by what can carry a bearer token:

``router`` — ``Depends(current_active_user)`` at the ROUTER level (never
    per-handler, so a newly added route cannot regress to "no auth"), plus a
    per-IP throttle, because each call spends real money at Anthropic:
        POST /discovery/search    query    -> ranked candidates
        POST /discovery/detail    url      -> full draft + context

``image_router`` — no auth dependency, by necessity:
        GET  /discovery/image?url=&sig=    thumbnail proxy

    An ``<img src>`` sends no ``Authorization`` header, so this route cannot
    be bearer-gated. It is authorised by the HMAC signature the API attached
    when it emitted the URL — it fetches only targets this app already chose,
    never one a caller supplies. See ``discovery_image_service`` for the full
    reasoning and the SSRF guard that backs it up.

Nothing here writes to the database.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from platform_shared.core.url_safety import UnsafeURLError

from app.core.auth import current_active_user
from app.core.rate_limit import check_discovery_rate_limit
from app.models.user.user import User
from app.schemas.recipe.discovery_schemas import (
    DiscoveredDetail,
    DiscoveryDetailRequest,
    DiscoveryQuery,
    DiscoveryResults,
)
from app.services.recipe import discovery_image_service, discovery_service
from app.services.recipe.discovery_image_service import (
    ImageFetchError,
    SignatureError,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/discovery",
    tags=["discovery"],
    dependencies=[Depends(current_active_user), Depends(check_discovery_rate_limit)],
)

image_router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.post("/search", response_model=DiscoveryResults)
async def search_recipes(
    payload: DiscoveryQuery,
    user: User = Depends(current_active_user),
) -> DiscoveryResults:
    """Search the web for the best versions of a dish.

    503 when discovery isn't configured, 422 when nothing usable came back.
    """
    try:
        return await discovery_service.search_recipes(payload.query)
    except discovery_service.DiscoveryUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except discovery_service.DiscoveryFailedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/detail", response_model=DiscoveredDetail)
async def read_recipe(
    payload: DiscoveryDetailRequest,
    user: User = Depends(current_active_user),
) -> DiscoveredDetail:
    """Read one discovered page in full and return an editable draft."""
    try:
        return await discovery_service.read_recipe(payload.url, payload.title)
    except UnsafeURLError as exc:
        raise HTTPException(status_code=400, detail="That URL can't be opened.") from exc
    except discovery_service.DiscoveryUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except discovery_service.DiscoveryFailedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@image_router.get("/image")
async def proxy_image(
    url: str = Query(max_length=2000),
    sig: str = Query(max_length=200),
) -> Response:
    """Serve a discovered thumbnail through this origin.

    Unauthenticated but not unauthorised: ``sig`` must be a live signature
    this app minted for exactly this ``url``.
    """
    try:
        body, content_type = await discovery_image_service.fetch_signed_image(url, sig)
    except SignatureError:
        # One status for every signature failure — distinguishing "expired"
        # from "forged" hands a caller an oracle.
        raise HTTPException(status_code=403, detail="Invalid image signature")
    except UnsafeURLError:
        raise HTTPException(status_code=400, detail="Unsupported image URL")
    except ImageFetchError as exc:
        # The tile falls back to a placeholder; log the reason, not the URL.
        logger.info("Discovery image unavailable: %s", exc)
        raise HTTPException(status_code=404, detail="Image unavailable")

    return Response(
        content=body,
        media_type=content_type,
        headers={
            # The upstream bytes are a third party's. Pin the type we
            # validated, forbid sniffing it into something executable, and
            # deny the response any privileges of its own.
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Referrer-Policy": "no-referrer",
            # Signatures outlive this, so caching is safe and keeps a
            # re-render of the grid from re-fetching every tile.
            "Cache-Control": "private, max-age=3600",
        },
    )
