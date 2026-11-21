"""WoW Forever auction-house prices — public, both modes (serve-only prod included).

    GET /api/wow/prices?server=pvp&faction=alliance|horde|neutral
        — one server's auction house for one faction (US; the house per
          server and faction is ``PRICE_SERVER_HOUSES``), and when Blizzard
          took its snapshot. Defaults: the PvP server, Alliance. An unmapped
          server or unknown faction is a 422.

    POST /api/wow/prices/refresh?server=pvp&faction=alliance|horde|neutral
        — "Refresh now": the scheduler pulls that ONE house from Blizzard in the
          background (202 started; the API only records the click), at most once per ``PRICE_REFRESH_COOLDOWN`` per house
          (200 cooldown + retry_after_seconds), or 200 refreshing while a
          scheduled refresh is already running. 429 past the per-IP limit,
          503 when price refreshes are switched off or the scheduler isn't running.
    GET /api/wow/prices/refresh?server=&faction=
        — the house's snapshot time, last download, when "Refresh now" works
          again and when the last refresh failed; never cached, so the page
          can watch a refresh finish.

Filled by the scheduled refresh (``app/services/wow/prices/``) or a click on
"Refresh now". Cached for ``PRICE_CACHE_SECONDS`` and sent with an ETag that changes
only when a new set lands, so a revisit is a 304.

Performance notes
-----------------
* The 304 short-circuit reads only the ``wow_price_feed`` row (< 1 ms) and
  returns before touching the ~6 850 ``wow_item_price`` rows.
* After the first full 200, the serialized JSON is kept in
  ``price_response_cache`` keyed by ETag so subsequent 200s skip the
  item-row query AND the serialization step.
* ``_etags_weakly_match`` implements RFC 7232 weak comparison so the round
  trip stays a 304 when Caddy's ``encode`` module weakens the strong ETag to
  ``W/"…"`` before forwarding it to the browser.
"""
import json
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
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
from app.services.wow.prices import price_response_cache
from app.services.wow.prices.price_refresh_unavailable_error import PriceRefreshUnavailableError

router = APIRouter(tags=["wow"])

price_refresh_limiter = RateLimiter(
    max_attempts=PRICE_REFRESH_RATE_LIMIT, window_seconds=PRICE_REFRESH_RATE_WINDOW_SECONDS,
)
price_refresh_state_limiter = RateLimiter(
    max_attempts=PRICE_REFRESH_STATE_RATE_LIMIT, window_seconds=PRICE_REFRESH_STATE_RATE_WINDOW_SECONDS,
)

PRICE_REFRESH_DISABLED: Final = "price_refresh_disabled"
PRICES_UNAVAILABLE: Final = "prices_unavailable"
PRICE_REFRESH_UNAVAILABLE: Final = "price_refresh_unavailable"

# Prices refresh every few hours; ten minutes of browser cache costs nothing.
PRICE_CACHE_SECONDS: Final = 600
_CACHE_CONTROL: Final = f"public, max-age={PRICE_CACHE_SECONDS}"
_JSON_CONTENT_TYPE: Final = "application/json"


def _etags_weakly_match(client_etag: str, server_etag: str) -> bool:
    """RFC 7232 s3.2 weak comparison: strip the ``W/`` prefix before comparing.

    Caddy's ``encode`` module weakens a strong ETag from ``"hash"`` to
    ``W/"hash"`` when it compresses the response. The browser stores the
    weakened form and sends it back as ``If-None-Match: W/"hash"``. Without
    this function the backend would compare ``W/"hash"`` against ``"hash"``
    and always miss, causing every conditional request to load the full
    item-row set again.
    """
    def _core(tag: str) -> str:
        return tag.removeprefix("W/")

    return _core(client_etag) == _core(server_etag)


@router.get("/wow/prices", response_model=WowPriceList)
async def list_prices(
    request: Request,
    server: PriceServer = Query(DEFAULT_PRICE_SERVER),
    faction: PriceFaction = Query(DEFAULT_PRICE_FACTION),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """One server's US auction-house prices for one faction. Public.

    Fast path (304): loads only the feed row to compute the ETag, then returns
    304 without touching the item-price rows.

    Fast path (200, cache hit): the feed-row ETag matches a serialized response
    in the in-process cache; returns cached bytes without loading item rows or
    re-serializing.

    Slow path (200, cache miss): loads item rows and serializes the full body,
    then stores the bytes in the cache for the next request.
    """
    # Step 1: ETag from feed row only — cheap, no item rows loaded yet.
    etag = await price_read_service.quick_etag(db, server, faction)
    headers = {"Cache-Control": _CACHE_CONTROL, "ETag": etag}

    # Step 2: 304 short-circuit — saves the full item-row query on cache hits.
    # Weak comparison (RFC 7232) so Caddy's encode-weakened ``W/"…"`` also matches.
    if_none_match = request.headers.get("If-None-Match", "")
    if if_none_match and _etags_weakly_match(if_none_match, etag):
        return Response(status_code=304, headers=headers)

    # Step 3: in-process body cache — avoids item rows + serialization on 200s.
    cached_bytes = price_response_cache.get(etag)
    if cached_bytes is not None:
        return Response(content=cached_bytes, media_type=_JSON_CONTENT_TYPE, headers=headers)

    # Step 4: full load — 6 850 item rows + serialization (happens once per new ETag).
    prices = await price_read_service.served_prices(db, server, faction)
    body_bytes = json.dumps(prices.body.model_dump(mode="json")).encode()
    price_response_cache.put(prices.etag, body_bytes)
    # Use the etag from served_prices (may differ from quick_etag on a mid-request
    # refresh; the response is consistent with what was loaded).
    headers["ETag"] = prices.etag
    return Response(content=body_bytes, media_type=_JSON_CONTENT_TYPE, headers=headers)


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
    server: PriceServer = Query(DEFAULT_PRICE_SERVER),
    faction: PriceFaction = Query(DEFAULT_PRICE_FACTION),
) -> WowPriceRefreshResponse:
    """"Refresh now": ask the scheduler to pull ONE house from Blizzard; answers once the click is recorded. Public, limited per IP."""
    if not settings.wow_price_refresh_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=PRICE_REFRESH_DISABLED)
    check_with_retry_after(price_refresh_limiter, f"wow-price-refresh:{get_client_ip(request)}")
    claim = await price_refresh_now_service.claim(server, faction)
    if claim is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=PRICES_UNAVAILABLE)
    if claim.status != "started":
        response.status_code = status.HTTP_200_OK
        return WowPriceRefreshResponse(status=claim.status, retry_after_seconds=claim.retry_after_seconds)
    try:
        await price_refresh_now_service.hand_to_scheduler(claim)
    except PriceRefreshUnavailableError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=PRICE_REFRESH_UNAVAILABLE)
    return WowPriceRefreshResponse(status="started", retry_after_seconds=claim.retry_after_seconds)
