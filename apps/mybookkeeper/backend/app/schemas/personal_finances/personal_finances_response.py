"""``GET /personal-finances``: money in and out through your accounts over a range of months."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel

from app.schemas.personal_finances.personal_finances_average_response import (
    PersonalFinancesAverageResponse,
)
from app.schemas.personal_finances.personal_finances_category_response import (
    PersonalFinancesCategoryResponse,
)
from app.schemas.personal_finances.personal_finances_income_split_response import (
    PersonalFinancesIncomeSplitResponse,
)
from app.schemas.personal_finances.personal_finances_month_response import (
    PersonalFinancesMonthResponse,
)
from app.schemas.personal_finances.personal_finances_one_off_response import (
    PersonalFinancesOneOffResponse,
)
from app.schemas.personal_finances.personal_finances_totals_response import (
    PersonalFinancesTotalsResponse,
)


class PersonalFinancesResponse(BaseModel):
    currency: str
    # The first day a bank feed covers; the page counts from it on. None
    # when no bank is connected, and then there is nothing to show.
    bank_history_start: _dt.date | None
    # The range shown, "YYYY-MM" both ends; None with no bank history.
    start: str | None
    end: str | None
    # Every calendar year the bank history touches, newest first.
    years: list[int]
    # Every month in the range, oldest first, empty months included.
    months: list[PersonalFinancesMonthResponse]
    totals: PersonalFinancesTotalsResponse
    income_split: PersonalFinancesIncomeSplitResponse
    # Expenses by heading, largest first.
    by_category: list[PersonalFinancesCategoryResponse]
    # Large one-off payments in, oldest first. They count in the totals.
    one_offs: list[PersonalFinancesOneOffResponse]
    average: PersonalFinancesAverageResponse
