"""Budgets: a month's budget against actual spending, and setting a budget.

Orchestration only — data access goes through repositories, the counting
rules live in ``budget_month``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.month_text import month_end, parse_month
from app.db.session import unit_of_work
from app.mappers import spending_budget_mapper
from app.repositories.budgets import personal_spending_repo, spending_budget_repo
from app.repositories.transactions import spending_category_repo
from app.schemas.budgets.budget_month_response import BudgetMonthResponse
from app.schemas.budgets.spending_budget_response import SpendingBudgetResponse
from app.schemas.budgets.spending_budget_update_request import SpendingBudgetUpdateRequest
from app.services.budgets import budget_month


class BudgetCategoryNotFoundError(LookupError):
    pass


class BudgetCategoryArchivedError(ValueError):
    pass


async def get_month(*, organization_id: uuid.UUID, month: _dt.date) -> BudgetMonthResponse:
    """``month`` is the first of the month."""
    async with unit_of_work() as db:
        categories = await spending_category_repo.list_for_org(
            db, organization_id=organization_id, include_archived=True,
        )
        budget_rows = await spending_budget_repo.list_through(
            db, organization_id=organization_id, month=month,
        )
        totals = await personal_spending_repo.totals_by_category(
            db, organization_id=organization_id, start=month, end=month_end(month),
        )
    return budget_month.build_month(
        month=month, categories=categories, budget_rows=budget_rows, totals=totals,
    )


async def set_budget(
    *,
    organization_id: uuid.UUID,
    spending_category_id: uuid.UUID,
    payload: SpendingBudgetUpdateRequest,
) -> SpendingBudgetResponse:
    month = parse_month(payload.effective_month)
    async with unit_of_work() as db:
        category = await spending_category_repo.get(
            db, category_id=spending_category_id, organization_id=organization_id,
        )
        if category is None:
            raise BudgetCategoryNotFoundError(spending_category_id)
        if category.archived_at is not None:
            raise BudgetCategoryArchivedError("An archived category can't be budgeted")
        budget = await spending_budget_repo.upsert(
            db,
            organization_id=organization_id,
            spending_category_id=spending_category_id,
            effective_month=month,
            amount_cents=payload.amount_cents,
        )
        return spending_budget_mapper.to_response(budget)
