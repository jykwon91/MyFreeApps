"""HTTP routes for the monthly expenses page.

Route prefix: /monthly-expenses.
"""
from __future__ import annotations

import datetime as _dt

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.context import RequestContext
from app.core.monthly_expense_constants import (
    DEFAULT_MONTHLY_EXPENSE_RANGE,
    DEFAULT_MONTHLY_EXPENSE_SCOPE,
    EXPENSE_LABEL_MAX_LENGTH,
)
from app.core.permissions import current_org_member
from app.schemas.monthly_expenses.monthly_expense_category_detail_response import (
    MonthlyExpenseCategoryDetailResponse,
)
from app.schemas.monthly_expenses.monthly_expenses_response import MonthlyExpensesResponse
from app.services.monthly_expenses import monthly_expense_service

router = APIRouter(prefix="/monthly-expenses", tags=["monthly-expenses"])


@router.get("", response_model=MonthlyExpensesResponse)
async def get_monthly_expenses(
    range_key: str = Query(DEFAULT_MONTHLY_EXPENSE_RANGE, alias="range"),
    scope: str = Query(DEFAULT_MONTHLY_EXPENSE_SCOPE),
    ctx: RequestContext = Depends(current_org_member),
) -> MonthlyExpensesResponse:
    try:
        return await monthly_expense_service.get_monthly_expenses(
            organization_id=ctx.organization_id,
            range_key=range_key,
            scope=scope,
            today=_dt.date.today(),
        )
    except monthly_expense_service.InvalidMonthlyExpenseRangeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown range: {exc}") from exc
    except monthly_expense_service.InvalidMonthlyExpenseScopeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown scope: {exc}") from exc


@router.get("/category", response_model=MonthlyExpenseCategoryDetailResponse)
async def get_monthly_expense_category(
    label: str = Query(..., alias="category", min_length=1, max_length=EXPENSE_LABEL_MAX_LENGTH),
    range_key: str = Query(DEFAULT_MONTHLY_EXPENSE_RANGE, alias="range"),
    scope: str = Query(DEFAULT_MONTHLY_EXPENSE_SCOPE),
    ctx: RequestContext = Depends(current_org_member),
) -> MonthlyExpenseCategoryDetailResponse:
    try:
        return await monthly_expense_service.get_category_detail(
            organization_id=ctx.organization_id,
            range_key=range_key,
            scope=scope,
            label=label,
            today=_dt.date.today(),
        )
    except monthly_expense_service.InvalidMonthlyExpenseRangeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown range: {exc}") from exc
    except monthly_expense_service.InvalidMonthlyExpenseScopeError as exc:
        raise HTTPException(status_code=422, detail=f"Unknown scope: {exc}") from exc
