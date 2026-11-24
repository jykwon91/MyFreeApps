"""HTTP routes for investment holdings.

Route prefix: /holdings. The signed-in person's own holdings in the current
workspace. Holdings synced from a bank are read-only; the ones on accounts
kept by hand can be added, edited and removed.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.investments.holding_create_request import HoldingCreateRequest
from app.schemas.investments.holding_list_response import HoldingListResponse
from app.schemas.investments.holding_response import HoldingResponse
from app.schemas.investments.holding_update_request import HoldingUpdateRequest
from app.services.investments import holding_service
from app.services.investments.duplicate_holding_error import DuplicateHoldingError
from app.services.investments.holding_not_found_error import HoldingNotFoundError
from app.services.investments.invalid_holding_error import InvalidHoldingError

router = APIRouter(prefix="/holdings", tags=["holdings"])

_NOT_FOUND_DETAIL = "Holding or account not found"


@router.get("", response_model=HoldingListResponse)
async def list_holdings(
    financial_account_id: uuid.UUID | None = Query(default=None),
    ctx: RequestContext = Depends(current_org_member),
) -> HoldingListResponse:
    try:
        return await holding_service.list_holdings(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            financial_account_id=financial_account_id,
        )
    except HoldingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc


@router.post("", response_model=HoldingResponse, status_code=201)
async def create_holding(
    payload: HoldingCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> HoldingResponse:
    try:
        return await holding_service.create_holding(
            user_id=ctx.user_id, organization_id=ctx.organization_id, payload=payload,
        )
    except HoldingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except InvalidHoldingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateHoldingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/{holding_id}", response_model=HoldingResponse)
async def update_holding(
    holding_id: uuid.UUID,
    payload: HoldingUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> HoldingResponse:
    try:
        return await holding_service.update_holding(
            holding_id=holding_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            payload=payload,
        )
    except HoldingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except InvalidHoldingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateHoldingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{holding_id}", status_code=204)
async def delete_holding(
    holding_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await holding_service.delete_holding(
            holding_id=holding_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except HoldingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except InvalidHoldingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(status_code=204)
