"""HTTP routes for personal spending categories.

Route prefix: /spending-categories.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.spending_categories.spending_category_create_request import (
    SpendingCategoryCreateRequest,
)
from app.schemas.spending_categories.spending_category_list_response import (
    SpendingCategoryListResponse,
)
from app.schemas.spending_categories.spending_category_response import SpendingCategoryResponse
from app.schemas.spending_categories.spending_category_update_request import (
    SpendingCategoryUpdateRequest,
)
from app.services.spending_categories import spending_category_service

router = APIRouter(prefix="/spending-categories", tags=["spending-categories"])

_NOT_FOUND_DETAIL = "Spending category not found"


@router.get("", response_model=SpendingCategoryListResponse)
async def list_spending_categories(
    include_archived: bool = False,
    ctx: RequestContext = Depends(current_org_member),
) -> SpendingCategoryListResponse:
    return await spending_category_service.list_categories(
        organization_id=ctx.organization_id,
        include_archived=include_archived,
    )


@router.post("", response_model=SpendingCategoryResponse, status_code=201)
async def create_spending_category(
    payload: SpendingCategoryCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SpendingCategoryResponse:
    try:
        return await spending_category_service.create_category(
            organization_id=ctx.organization_id,
            payload=payload,
        )
    except spending_category_service.SpendingCategoryConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/{category_id}", response_model=SpendingCategoryResponse)
async def update_spending_category(
    category_id: uuid.UUID,
    payload: SpendingCategoryUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SpendingCategoryResponse:
    try:
        return await spending_category_service.update_category(
            category_id=category_id,
            organization_id=ctx.organization_id,
            payload=payload,
        )
    except spending_category_service.SpendingCategoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except spending_category_service.SpendingCategoryConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{category_id}/archive", response_model=SpendingCategoryResponse)
async def archive_spending_category(
    category_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> SpendingCategoryResponse:
    try:
        return await spending_category_service.archive_category(
            category_id=category_id,
            organization_id=ctx.organization_id,
        )
    except spending_category_service.SpendingCategoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except spending_category_service.SpendingCategoryDefaultArchiveError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{category_id}/unarchive", response_model=SpendingCategoryResponse)
async def unarchive_spending_category(
    category_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> SpendingCategoryResponse:
    try:
        return await spending_category_service.unarchive_category(
            category_id=category_id,
            organization_id=ctx.organization_id,
        )
    except spending_category_service.SpendingCategoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except spending_category_service.SpendingCategoryConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
