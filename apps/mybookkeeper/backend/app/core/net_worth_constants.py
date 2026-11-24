"""Canonical values for the net worth page.

``NET_WORTH_RANGES`` and ``NET_WORTH_GROUPS`` are mirrored in
``api-client/src/constants/netWorth.ts`` — a value added here MUST be added
there in the same PR.
"""
from app.core.financial_account_enums import (
    ACCOUNT_TYPE_BROKERAGE,
    ACCOUNT_TYPE_CASH,
    ACCOUNT_TYPE_CHECKING,
    ACCOUNT_TYPE_CREDIT_CARD,
    ACCOUNT_TYPE_HSA,
    ACCOUNT_TYPE_LOAN,
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPE_OTHER_ASSET,
    ACCOUNT_TYPE_OTHER_LIABILITY,
    ACCOUNT_TYPE_RETIREMENT,
    ACCOUNT_TYPE_SAVINGS,
    DEFAULT_CURRENCY,
)

# Where a line on the page comes from.
SOURCE_ACCOUNT = "account"
SOURCE_MORTGAGE = "mortgage"
SOURCE_PROPERTY = "property"

GROUP_CASH = "cash"
GROUP_INVESTMENTS = "investments"
GROUP_PROPERTY = "property"
GROUP_OTHER_ASSETS = "other_assets"
GROUP_CREDIT_CARDS = "credit_cards"
GROUP_LOANS = "loans"
GROUP_OTHER_LIABILITIES = "other_liabilities"

# Display order: what you have, then what you owe.
NET_WORTH_GROUPS: tuple[str, ...] = (
    GROUP_CASH,
    GROUP_INVESTMENTS,
    GROUP_PROPERTY,
    GROUP_OTHER_ASSETS,
    GROUP_CREDIT_CARDS,
    GROUP_LOANS,
    GROUP_OTHER_LIABILITIES,
)

GROUP_FOR_ACCOUNT_TYPE: dict[str, str] = {
    ACCOUNT_TYPE_CHECKING: GROUP_CASH,
    ACCOUNT_TYPE_SAVINGS: GROUP_CASH,
    ACCOUNT_TYPE_CASH: GROUP_CASH,
    ACCOUNT_TYPE_BROKERAGE: GROUP_INVESTMENTS,
    ACCOUNT_TYPE_RETIREMENT: GROUP_INVESTMENTS,
    ACCOUNT_TYPE_HSA: GROUP_INVESTMENTS,
    ACCOUNT_TYPE_OTHER_ASSET: GROUP_OTHER_ASSETS,
    ACCOUNT_TYPE_CREDIT_CARD: GROUP_CREDIT_CARDS,
    ACCOUNT_TYPE_LOAN: GROUP_LOANS,
    ACCOUNT_TYPE_MORTGAGE: GROUP_LOANS,
    ACCOUNT_TYPE_OTHER_LIABILITY: GROUP_OTHER_LIABILITIES,
}

# The totals are in one currency; a line in another is listed but not added,
# because adding dollars to euros produces a number that means nothing.
# Mortgages and properties have no currency column and are in this one.
NET_WORTH_CURRENCY = DEFAULT_CURRENCY

# A balance older than this gets a "may be out of date" hint. Long enough that
# a monthly statement (a loan, a hand-kept account) isn't flagged every month.
STALE_AFTER_DAYS = 45

RANGE_1M = "1m"
RANGE_3M = "3m"
RANGE_1Y = "1y"
RANGE_ALL = "all"
NET_WORTH_RANGES: tuple[str, ...] = (RANGE_1M, RANGE_3M, RANGE_1Y, RANGE_ALL)
# Days of history before today each range shows; None is everything recorded.
RANGE_DAYS: dict[str, int | None] = {
    RANGE_1M: 30,
    RANGE_3M: 91,
    RANGE_1Y: 365,
    RANGE_ALL: None,
}
DEFAULT_RANGE = RANGE_3M

# A typo guard on a person-entered home value: $1 billion.
PROPERTY_VALUE_MAX_CENTS = 100_000_000_000
