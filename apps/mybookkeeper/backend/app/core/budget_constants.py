"""Canonical values for the budget and cash flow pages.

``CASH_FLOW_RANGES`` and ``CASH_FLOW_SCOPES`` are mirrored in
``api-client/src/constants/budget.ts`` — a value added here MUST be added
there in the same PR.
"""
from app.core.financial_account_enums import DEFAULT_CURRENCY
from app.core.spending_category_enums import TRANSACTION_SCOPES

# Transactions have no currency column; every amount is in this one.
BUDGET_CURRENCY = DEFAULT_CURRENCY

# A month on the wire is "YYYY-MM". The years match what a transaction may be
# dated (``chk_txn_tax_year``), so a month outside them has nothing to show.
MONTH_FORMAT_PATTERN = r"^\d{4}-\d{2}$"
MONTH_MIN_YEAR = 2020
MONTH_MAX_YEAR = 2099

# $10M a month: far above any real personal budget, low enough that a
# mistyped amount is refused rather than saved.
BUDGET_AMOUNT_MAX_CENTS = 10_000_000_00

RANGE_6M = "6m"
RANGE_12M = "12m"
RANGE_YTD = "ytd"
CASH_FLOW_RANGES: tuple[str, ...] = (RANGE_6M, RANGE_12M, RANGE_YTD)
# Months each range shows, ending with this month; None is January to now.
RANGE_MONTHS: dict[str, int | None] = {
    RANGE_6M: 6,
    RANGE_12M: 12,
    RANGE_YTD: None,
}
DEFAULT_CASH_FLOW_RANGE = RANGE_6M

SCOPE_ALL = "all"
CASH_FLOW_SCOPES: tuple[str, ...] = (SCOPE_ALL, *TRANSACTION_SCOPES)
DEFAULT_CASH_FLOW_SCOPE = SCOPE_ALL
