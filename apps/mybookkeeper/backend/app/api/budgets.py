"""HTTP routes for the budget page.

Route prefix: /budgets.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.month_text import month_start, parse_month
from app.core.permissions import current_org_member, require_write_access
from app.schemas.budgets.budget_month_response import BudgetMonthResponse
from app.schemas.budgets.spending_budget_response import SpendingBudgetResponse
from app.schemas.budgets.spending_budget_update_request import SpendingBudgetUpdateRequest
from app.services.budgets import budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=BudgetMonthResponse)
async def get_budget_month(
    month: str | None = Query(None, description="YYYY-MM; this month when left out"),
    ctx: RequestContext = Depends(current_org_member),
) -> BudgetMonthResponse:
    try:
        first = month_start(_dt.date.today()) if month is None else parse_month(month)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await budget_service.get_month(organization_id=ctx.organization_id, month=first)


@router.put("/{spending_category_id}", response_model=SpendingBudgetResponse)
async def set_category_budget(
    spending_category_id: uuid.UUID,
    payload: SpendingBudgetUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SpendingBudgetResponse:
    try:
        return await budget_service.set_budget(
            organization_id=ctx.organization_id,
            spending_category_id=spending_category_id,
            payload=payload,
        )
    except budget_service.BudgetCategoryNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Spending category not found") from exc
    except budget_service.BudgetCategoryArchivedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
