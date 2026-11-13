"""WoW Forever auction-house prices — public, both modes (serve-only prod included).

    GET /api/wow/prices?server=pvp&faction=alliance|horde|neutral
        — one server's auction house for one faction (US; the house per
          server and faction is ``PRICE_SERVER_HOUSES``), and when Blizzard
          took its snapshot. Defaults: the PvP server, Alliance. An unmapped
          server or unknown faction is a 422.

    POST /api/wow/prices/refresh?server=pvp&faction=alliance|horde|neutral
        — "Refresh now": pull that ONE house from Blizzard in the background
          (202 started), at most once per ``PRICE_REFRESH_COOLDOWN`` per house
          (200 cooldown + retry_after_seconds), or 200 refreshing while a
          scheduled refresh is already running. 429 past the per-IP limit,
          503 when price refreshes are switched off.
    GET /api/wow/prices/refresh?server=&faction=
        — the house's snapshot time, last download, when "Refresh now" works
          again and when the last refresh failed; never cached, so the page
          can watch a refresh finish.

Filled by the scheduled refresh (``app/services/wow/prices/``) or a click on
"Refresh now". Cached for ``PRICE_CACHE_SECONDS`` and sent with an ETag that changes
only when a new set lands, so a revisit is a 304.
"""
from typing import Final

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.request_utils import get_client_ip

from app.core.config import settings
from app.core.rate_limit import RateLimiter, check_with_retry_after
from app.core.wow_prices import (
    DEFAULT_PRICE_FACTION,
    DEFAULT_PRICE_SERVER,
    PRICE_REFRESH_RATE_LIMIT,
    PRICE_REFRESH_RATE_WINDOW_SECONDS,
    PRICE_REFRESH_STATE_RATE_LIMIT,
    PRICE_REFRESH_STATE_RATE_WINDOW_SECONDS,
    PriceFaction,
    PriceServer,
)
from app.db.session import get_db
from app.schemas.wow.price_list import WowPriceList
from app.schemas.wow.price_refresh_response import WowPriceRefreshResponse
from app.schemas.wow.price_refresh_state import WowPriceRefreshState
from app.services.wow.prices import price_read_service, price_refresh_now_service

router = APIRouter(tags=["wow"])

price_refresh_limiter = RateLimiter(
    max_attempts=PRICE_REFRESH_RATE_LIMIT, window_seconds=PRICE_REFRESH_RATE_WINDOW_SECONDS,
)
price_refresh_state_limiter = RateLimiter(
    max_attempts=PRICE_REFRESH_STATE_RATE_LIMIT, window_seconds=PRICE_REFRESH_STATE_RATE_WINDOW_SECONDS,
)

PRICE_REFRESH_DISABLED: Final = "price_refresh_disabled"
PRICES_UNAVAILABLE: Final = "prices_unavailable"

# Prices refresh every few hours; ten minutes of browser cache costs nothing.
PRICE_CACHE_SECONDS: Final = 600
_CACHE_CONTROL: Final = f"public, max-age={PRICE_CACHE_SECONDS}"


@router.get("/wow/prices", response_model=WowPriceList)
async def list_prices(
    request: Request,
    server: PriceServer = Query(DEFAULT_PRICE_SERVER),
    faction: PriceFaction = Query(DEFAULT_PRICE_FACTION),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """One server's US auction-house prices for one faction. Public."""
    prices = await price_read_service.served_prices(db, server, faction)
    headers = {"Cache-Control": _CACHE_CONTROL, "ETag": prices.etag}
    if request.headers.get("If-None-Match") == prices.etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(content=prices.body.model_dump(mode="json"), headers=headers)


@router.get("/wow/prices/refresh", response_model=WowPriceRefreshState)
async def get_price_refresh_state(
    request: Request,
    server: PriceServer = Query(DEFAULT_PRICE_SERVER),
    faction: PriceFaction = Query(DEFAULT_PRICE_FACTION),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """The house's refresh state. Public; never cached, so a poll sees a refresh land."""
    check_with_retry_after(price_refresh_state_limiter, f"wow-price-refresh-state:{get_client_ip(request)}")
    state = await price_refresh_now_service.state(db, server, faction)
    return JSONResponse(content=state.model_dump(mode="json"), headers={"Cache-Control": "no-store"})


@router.post("/wow/prices/refresh", response_model=WowPriceRefreshResponse, status_code=status.HTTP_202_ACCEPTED)
async def refresh_prices(
    request: Request,
    response: Response,
    background: BackgroundTasks,
    server: PriceServer = Query(DEFAULT_PRICE_SERVER),
    faction: PriceFaction = Query(DEFAULT_PRICE_FACTION),
) -> WowPriceRefreshResponse:
    """"Refresh now": pull ONE house from Blizzard after this response. Public, limited per IP."""
    if not settings.wow_price_refresh_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=PRICE_REFRESH_DISABLED)
    check_with_retry_after(price_refresh_limiter, f"wow-price-refresh:{get_client_ip(request)}")
    claim = await price_refresh_now_service.claim(server, faction)
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=PRICES_UNAVAILABLE)
    if claim.status != "started":
        response.status_code = status.HTTP_200_OK
        return WowPriceRefreshResponse(status=claim.status, retry_after_seconds=claim.retry_after_seconds)
    background.add_task(price_refresh_now_service.run, claim)
    return WowPriceRefreshResponse(status="started", retry_after_seconds=claim.retry_after_seconds)
