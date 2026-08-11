"""HTTP routes for market rate benchmarks.

Route prefix: /market-rate-benchmarks.

Keyed on service type rather than an id: there is at most one benchmark per
service per organization, so the service type *is* the address. That makes the
write a PUT (idempotent upsert) instead of a POST/PATCH pair.

The comparison these benchmarks feed lives at ``/utility-plans/rate-comparison``
— it returns plans, so it belongs on the plan resource next to
``/renewal-alerts``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.properties.market_rate_benchmark_response import (
    MarketRateBenchmarkResponse,
)
from app.schemas.properties.market_rate_benchmark_upsert_request import (
    MarketRateBenchmarkUpsertRequest,
)
from app.services.properties import market_rate_benchmark_service

router = APIRouter(prefix="/market-rate-benchmarks", tags=["market-rate-benchmarks"])

_NOT_FOUND_DETAIL = "No benchmark recorded for that service type"


@router.get("", response_model=list[MarketRateBenchmarkResponse])
async def list_benchmarks(
    ctx: RequestContext = Depends(current_org_member),
) -> list[MarketRateBenchmarkResponse]:
    """Every benchmark the organization has recorded.

    Unpaginated: capped at one row per service type by a unique index.
    """
    return await market_rate_benchmark_service.list_benchmarks(
        organization_id=ctx.organization_id,
    )


@router.put("/{service_type}", response_model=MarketRateBenchmarkResponse)
async def upsert_benchmark(
    payload: MarketRateBenchmarkUpsertRequest,
    service_type: str = Path(..., min_length=1, max_length=20),
    ctx: RequestContext = Depends(require_write_access),
) -> MarketRateBenchmarkResponse:
    try:
        return await market_rate_benchmark_service.upsert_benchmark(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            service_type=service_type,
            rate_cents_per_kwh=payload.rate_cents_per_kwh,
            monthly_cents=payload.monthly_cents,
            source=payload.source,
            observed_on=payload.observed_on,
            notes=payload.notes,
        )
    except market_rate_benchmark_service.InvalidMarketRateBenchmarkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{service_type}", status_code=204)
async def delete_benchmark(
    service_type: str = Path(..., min_length=1, max_length=20),
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await market_rate_benchmark_service.delete_benchmark(
            organization_id=ctx.organization_id,
            service_type=service_type,
        )
    except market_rate_benchmark_service.InvalidMarketRateBenchmarkError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except market_rate_benchmark_service.MarketRateBenchmarkNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    return Response(status_code=204)
