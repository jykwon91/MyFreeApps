"""HTTP routes for financial accounts (bank, card, loan, investment).

Route prefix: /financial-accounts.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.financial_accounts.financial_account_create_request import (
    FinancialAccountCreateRequest,
)
from app.schemas.financial_accounts.financial_account_list_response import (
    FinancialAccountListResponse,
)
from app.schemas.financial_accounts.financial_account_response import FinancialAccountResponse
from app.schemas.financial_accounts.financial_account_update_request import (
    FinancialAccountUpdateRequest,
)
from app.services.financial_accounts import financial_account_service

router = APIRouter(prefix="/financial-accounts", tags=["financial-accounts"])

_NOT_FOUND_DETAIL = "Account not found"


@router.get("", response_model=FinancialAccountListResponse)
async def list_financial_accounts(
    ctx: RequestContext = Depends(current_org_member),
) -> FinancialAccountListResponse:
    return await financial_account_service.list_accounts(
        user_id=ctx.user_id, organization_id=ctx.organization_id,
    )


@router.post("", response_model=FinancialAccountResponse, status_code=201)
async def create_financial_account(
    payload: FinancialAccountCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> FinancialAccountResponse:
    try:
        return await financial_account_service.create_account(
            user_id=ctx.user_id, organization_id=ctx.organization_id, payload=payload,
        )
    except financial_account_service.InvalidFinancialAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{account_id}", response_model=FinancialAccountResponse)
async def get_financial_account(
    account_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> FinancialAccountResponse:
    try:
        return await financial_account_service.get_account(
            account_id=account_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except financial_account_service.FinancialAccountNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc


@router.patch("/{account_id}", response_model=FinancialAccountResponse)
async def update_financial_account(
    account_id: uuid.UUID,
    payload: FinancialAccountUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> FinancialAccountResponse:
    # ``exclude_unset`` keeps "omitted" apart from "set to null": clearing a
    # balance or reopening a closed account is a real edit.
    fields: dict[str, Any] = payload.model_dump(exclude_unset=True)
    try:
        if not fields:
            return await financial_account_service.get_account(
                account_id=account_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
            )
        return await financial_account_service.update_account(
            account_id=account_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            fields=fields,
        )
    except financial_account_service.FinancialAccountNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except financial_account_service.InvalidFinancialAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{account_id}", status_code=204)
async def delete_financial_account(
    account_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await financial_account_service.delete_account(
            account_id=account_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except financial_account_service.FinancialAccountNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    return Response(status_code=204)


@router.post("/{account_id}/restore", response_model=FinancialAccountResponse)
async def restore_financial_account(
    account_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> FinancialAccountResponse:
    """Undo a delete — what the Undo button on the delete toast calls."""
    try:
        return await financial_account_service.restore_account(
            account_id=account_id, user_id=ctx.user_id, organization_id=ctx.organization_id,
        )
    except financial_account_service.FinancialAccountNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except financial_account_service.InvalidFinancialAccountError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
