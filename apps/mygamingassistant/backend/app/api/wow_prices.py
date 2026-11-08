"""WoW Forever auction-house prices — public, both modes (serve-only prod included).

    GET /api/wow/prices   — every stored US price, with the source's credit
                            and when it was computed (prices are US only)

Filled by the scheduled refresh (``app/services/wow/prices/``), never by a
user. Cached for ``PRICE_CACHE_SECONDS`` and sent with an ETag that changes
only when a new set lands, so a revisit is a 304.
"""
from typing import Final

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.wow.price_list import WowPriceList
from app.services.wow.prices import price_read_service

router = APIRouter(tags=["wow"])

# Prices refresh every few hours; ten minutes of browser cache costs nothing.
PRICE_CACHE_SECONDS: Final = 600
_CACHE_CONTROL: Final = f"public, max-age={PRICE_CACHE_SECONDS}"


@router.get("/wow/prices", response_model=WowPriceList)
async def list_prices(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Every US auction-house price. Public."""
    prices = await price_read_service.served_prices(db)
    headers = {"Cache-Control": _CACHE_CONTROL, "ETag": prices.etag}
    if request.headers.get("If-None-Match") == prices.etag:
        return Response(status_code=304, headers=headers)
    return JSONResponse(content=prices.body.model_dump(mode="json"), headers=headers)
