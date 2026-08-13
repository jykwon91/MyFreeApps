"""HTTP routes for the organization's insurance benchmark.

Route prefix: /insurance-benchmarks.

A singleton resource: there is at most one benchmark per organization, so there
is no id in the path and the write is a PUT (idempotent upsert) rather than a
POST/PATCH pair.

The comparison these benchmarks feed lives at
``/insurance-policies/premium-comparison`` — it returns policies, so it belongs
on the policy resource.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.insurance.insurance_benchmark_response import (
    InsuranceBenchmarkResponse,
)
from app.schemas.insurance.insurance_benchmark_upsert_request import (
    InsuranceBenchmarkUpsertRequest,
)
from app.services.insurance import insurance_benchmark_service

router = APIRouter(prefix="/insurance-benchmarks", tags=["insurance-benchmarks"])


@router.get("", response_model=InsuranceBenchmarkResponse | None)
async def get_benchmark(
    ctx: RequestContext = Depends(current_org_member),
) -> InsuranceBenchmarkResponse | None:
    """The organization's recorded market observation, or null if none.

    Null rather than 404: "no benchmark recorded yet" is the ordinary starting
    state of every organization, not a client error, and the form that records
    one renders off exactly this response.
    """
    return await insurance_benchmark_service.get_benchmark(
        organization_id=ctx.organization_id,
    )


@router.put("", response_model=InsuranceBenchmarkResponse)
async def upsert_benchmark(
    payload: InsuranceBenchmarkUpsertRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> InsuranceBenchmarkResponse:
    return await insurance_benchmark_service.upsert_benchmark(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        annual_premium_cents=payload.annual_premium_cents,
        coverage_amount_cents=payload.coverage_amount_cents,
        region_label=payload.region_label,
        source=payload.source,
        observed_on=payload.observed_on,
        notes=payload.notes,
    )


@router.delete("", status_code=204)
async def delete_benchmark(
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await insurance_benchmark_service.delete_benchmark(
            organization_id=ctx.organization_id,
        )
    except insurance_benchmark_service.InsuranceBenchmarkNotFoundError:
        raise HTTPException(status_code=404, detail="Insurance benchmark not found")
    return Response(status_code=204)
