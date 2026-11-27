"""Personal finances: money in and out through your accounts over a range of months.

Orchestration only — money in is ``cash_flow_repo.list_income``, money out is
what ``spending_ledger`` counts as spent (the rows Cash flow and Monthly
expenses add up), the figures ``personal_finances_figures``. Counts from the
bank history start only (``cash_basis``): with no bank connected there is
nothing to show.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.budget_constants import BUDGET_CURRENCY
from app.core.month_text import (
    add_months,
    format_month,
    month_end,
    month_start,
    parse_month,
)
from app.core.spending_category_enums import TRANSACTION_SCOPE_RENTAL
from app.db.session import unit_of_work
from app.repositories.cash_flow import cash_basis, cash_flow_repo
from app.schemas.personal_finances.personal_finances_average_response import (
    PersonalFinancesAverageResponse,
)
from app.schemas.personal_finances.personal_finances_income_split_response import (
    PersonalFinancesIncomeSplitResponse,
)
from app.schemas.personal_finances.personal_finances_response import (
    PersonalFinancesResponse,
)
from app.schemas.personal_finances.personal_finances_totals_response import (
    PersonalFinancesTotalsResponse,
)
from app.services.monthly_expenses import spending_ledger
from app.services.personal_finances import personal_finances_figures as figures


class InvalidPersonalFinancesRangeError(ValueError):
    pass


async def get_personal_finances(
    *,
    organization_id: uuid.UUID,
    start: str | None,
    end: str | None,
    today: _dt.date,
) -> PersonalFinancesResponse:
    """``start`` / ``end`` are "YYYY-MM"; either left out runs to that end of
    the bank history. The range is held inside the bank history and this month."""
    first_asked = _parse(start)
    last_asked = _parse(end)
    this_month = month_start(today)
    async with unit_of_work() as db:
        history_start = await cash_basis.bank_history_start(db, organization_id=organization_id)
        if history_start is None:
            return nothing_yet()
        first_month = max(first_asked or month_start(history_start), month_start(history_start))
        last_month = min(last_asked or this_month, this_month)
        if first_month > last_month:
            raise InvalidPersonalFinancesRangeError(f"{start}..{end}")
        first_day, last_day = first_month, month_end(last_month)

        history = await cash_flow_repo.list_income(
            db,
            organization_id=organization_id,
            start=history_start,
            end=month_end(this_month),
            bank_history_start=history_start,
        )
        spending = await spending_ledger.counted_spending(
            db,
            organization_id=organization_id,
            first_day=first_day,
            last_day=last_day,
            transaction_scope=None,
            bank_history_start=history_start,
            approved_only=True,
        )
        rental_spending = await spending_ledger.counted_spending(
            db,
            organization_id=organization_id,
            first_day=first_day,
            last_day=last_day,
            transaction_scope=TRANSACTION_SCOPE_RENTAL,
            bank_history_start=history_start,
            approved_only=True,
        )

    months = _months(first_month, last_month)
    income = [row for row in history if first_day <= row.transaction_date <= last_day]
    one_offs = figures.one_off_ids(history)
    rows, totals, income_split, categories, average = figures.build(
        months,
        income=income,
        spending=spending,
        rental_costs=figures.rental_cost_ids(rental_spending),
        one_offs=one_offs,
        this_month=this_month,
    )
    return PersonalFinancesResponse(
        currency=BUDGET_CURRENCY,
        bank_history_start=history_start,
        start=format_month(first_month),
        end=format_month(last_month),
        years=list(range(this_month.year, history_start.year - 1, -1)),
        months=rows,
        totals=totals,
        income_split=income_split,
        by_category=categories,
        one_offs=figures.one_off_rows(income, one_offs),
        average=average,
    )


def _parse(text: str | None) -> _dt.date | None:
    if text is None:
        return None
    try:
        return parse_month(text)
    except ValueError as exc:
        raise InvalidPersonalFinancesRangeError(text) from exc


def _months(first: _dt.date, last: _dt.date) -> list[_dt.date]:
    months: list[_dt.date] = []
    month = first
    while month <= last:
        months.append(month)
        month = add_months(month, 1)
    return months


def nothing_yet() -> PersonalFinancesResponse:
    """The answer with no bank connected: nothing counted yet."""
    return PersonalFinancesResponse(
        currency=BUDGET_CURRENCY,
        bank_history_start=None,
        start=None,
        end=None,
        years=[],
        months=[],
        totals=PersonalFinancesTotalsResponse(income_cents=0, expenses_cents=0, mortgages_loans_cents=0, net_cents=0),
        income_split=PersonalFinancesIncomeSplitResponse(salary_cents=0, rental_net_cents=0, other_cents=0),
        by_category=[],
        one_offs=[],
        average=PersonalFinancesAverageResponse(
            months=0, income_cents=0, expenses_cents=0, net_cents=0, typical_income_cents=0, typical_net_cents=0,
        ),
    )
