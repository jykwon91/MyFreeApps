"""HTTP routes for utility plans.

Route prefix: /utility-plans.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.utility_plan_constants import EXPIRING_SOON_DAYS
from app.schemas.properties.utility_plan_create_request import UtilityPlanCreateRequest
from app.schemas.properties.utility_plan_list_response import UtilityPlanListResponse
from app.schemas.properties.utility_plan_renewal_alert_response import (
    UtilityPlanRenewalAlertResponse,
)
from app.schemas.properties.utility_plan_response import UtilityPlanResponse
from app.schemas.properties.utility_plan_update_request import UtilityPlanUpdateRequest
from app.services.properties import utility_plan_service

router = APIRouter(prefix="/utility-plans", tags=["utility-plans"])

_NOT_FOUND_DETAIL = "Utility plan not found"


@router.post("", response_model=UtilityPlanResponse, status_code=201)
async def create_plan(
    payload: UtilityPlanCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanResponse:
    return await utility_plan_service.create_plan(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        fields=payload.model_dump(),
    )


@router.get("", response_model=UtilityPlanListResponse)
async def list_plans(
    property_id: uuid.UUID | None = Query(None),
    service_type: str | None = Query(None),
    expiring_before: _dt.date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanListResponse:
    return await utility_plan_service.list_plans(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        property_id=property_id,
        service_type=service_type,
        expiring_before=expiring_before,
        limit=limit,
        offset=offset,
    )


@router.get("/renewal-alerts", response_model=UtilityPlanRenewalAlertResponse)
async def get_renewal_alerts(
    window_days: int = Query(EXPIRING_SOON_DAYS, ge=1, le=365),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanRenewalAlertResponse:
    """Current plans whose term has lapsed or lapses within ``window_days``.

    Declared before ``/{plan_id}`` so the literal path is not swallowed by the
    UUID route.
    """
    return await utility_plan_service.get_renewal_alerts(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        window_days=window_days,
    )


@router.get("/{plan_id}", response_model=UtilityPlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanResponse:
    try:
        return await utility_plan_service.get_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc


@router.patch("/{plan_id}", response_model=UtilityPlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    payload: UtilityPlanUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanResponse:
    # exclude_unset preserves the distinction between "field omitted" and
    # "field explicitly set to null".
    raw: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not raw:
        try:
            return await utility_plan_service.get_plan(
                user_id=ctx.user_id,
                organization_id=ctx.organization_id,
                plan_id=plan_id,
            )
        except utility_plan_service.UtilityPlanNotFoundError as exc:
            raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc

    try:
        return await utility_plan_service.update_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
            fields=raw,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except utility_plan_service.InvalidUtilityPlanError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await utility_plan_service.soft_delete_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    return Response(status_code=204)
