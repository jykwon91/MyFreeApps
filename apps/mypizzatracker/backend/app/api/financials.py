"""Operator financials routes.

  GET    /financials/drops/{drop_id}                    -- rollup payload
  PATCH  /financials/drops/{drop_id}/tip                -- update tip_total
  GET    /financials/drops/{drop_id}/expenses           -- list expenses
  POST   /financials/drops/{drop_id}/expenses           -- create expense
  PATCH  /financials/expenses/{expense_id}              -- update expense
  DELETE /financials/expenses/{expense_id}              -- delete expense

Auth is enforced at the router level (single-user app). Paths register
without ``/api`` per the project's router-prefix convention.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.schemas.drop.drop_schemas import DropRead
from app.schemas.expense.expense_schemas import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
)
from app.schemas.financials.financials_schemas import (
    DropFinancials,
    TipUpdate,
)
from app.services.financials import expense_service, financials_service
from app.services.financials.expense_service import ExpenseServiceError
from app.services.financials.financials_service import FinancialsServiceError

router = APIRouter(
    prefix="/financials",
    tags=["financials"],
    dependencies=[Depends(current_active_user)],
)


def _financials_error(exc: FinancialsServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


def _expense_error(exc: ExpenseServiceError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


@router.get("/drops/{drop_id}", response_model=DropFinancials)
async def get_drop_financials(
    drop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DropFinancials:
    try:
        return await financials_service.get_financials(db, drop_id)
    except FinancialsServiceError as exc:
        raise _financials_error(exc) from exc


@router.patch("/drops/{drop_id}/tip", response_model=DropRead)
async def update_drop_tip(
    drop_id: uuid.UUID,
    body: TipUpdate,
    db: AsyncSession = Depends(get_db),
) -> DropRead:
    try:
        drop = await financials_service.update_tip(db, drop_id, body.tip_total)
    except FinancialsServiceError as exc:
        raise _financials_error(exc) from exc
    return DropRead.model_validate(drop)


@router.get(
    "/drops/{drop_id}/expenses", response_model=list[ExpenseRead],
)
async def list_drop_expenses(
    drop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[ExpenseRead]:
    try:
        rows = await expense_service.list_expenses(db, drop_id)
    except ExpenseServiceError as exc:
        raise _expense_error(exc) from exc
    return [ExpenseRead.model_validate(r) for r in rows]


@router.post(
    "/drops/{drop_id}/expenses", response_model=ExpenseRead, status_code=201,
)
async def create_drop_expense(
    drop_id: uuid.UUID,
    body: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
) -> ExpenseRead:
    try:
        expense = await expense_service.create_expense(
            db, drop_id, body.model_dump(),
        )
    except ExpenseServiceError as exc:
        raise _expense_error(exc) from exc
    return ExpenseRead.model_validate(expense)


@router.patch(
    "/expenses/{expense_id}", response_model=ExpenseRead,
)
async def update_expense(
    expense_id: uuid.UUID,
    body: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
) -> ExpenseRead:
    patch = body.model_dump(exclude_unset=True)
    try:
        expense = await expense_service.update_expense(db, expense_id, patch)
    except ExpenseServiceError as exc:
        raise _expense_error(exc) from exc
    return ExpenseRead.model_validate(expense)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await expense_service.delete_expense(db, expense_id)
    except ExpenseServiceError as exc:
        raise _expense_error(exc) from exc
