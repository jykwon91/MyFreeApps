"""Canonical values and limits for securities and holdings.

``String(N)`` plus a ``CheckConstraint`` per project convention. The security
types are Plaid's own list (https://plaid.com/docs/api/products/investments/,
``securities[].type``) with spaces turned into underscores, so a Plaid type
maps onto one value and a hand-entered holding picks from the same list.

Mirrored in ``api-client/src/constants/securityTypes.ts`` — a value added here
MUST be added there in the same PR.
"""
from typing import Final

SECURITY_TYPE_CASH: Final = "cash"
SECURITY_TYPE_CRYPTOCURRENCY: Final = "cryptocurrency"
SECURITY_TYPE_DERIVATIVE: Final = "derivative"
SECURITY_TYPE_EQUITY: Final = "equity"
SECURITY_TYPE_ETF: Final = "etf"
SECURITY_TYPE_FIXED_INCOME: Final = "fixed_income"
SECURITY_TYPE_LOAN: Final = "loan"
SECURITY_TYPE_MUTUAL_FUND: Final = "mutual_fund"
# Plaid's "other", and what a null type from Plaid is stored as.
SECURITY_TYPE_OTHER: Final = "other"

SECURITY_TYPES: Final[tuple[str, ...]] = (
    SECURITY_TYPE_EQUITY,
    SECURITY_TYPE_ETF,
    SECURITY_TYPE_MUTUAL_FUND,
    SECURITY_TYPE_FIXED_INCOME,
    SECURITY_TYPE_CASH,
    SECURITY_TYPE_CRYPTOCURRENCY,
    SECURITY_TYPE_DERIVATIVE,
    SECURITY_TYPE_LOAN,
    SECURITY_TYPE_OTHER,
)
SECURITY_TYPES_SQL: Final = "('" + "', '".join(SECURITY_TYPES) + "')"
SECURITY_TYPE_MAX_LENGTH: Final = 20

TICKER_MAX_LENGTH: Final = 32
SECURITY_NAME_MAX_LENGTH: Final = 255
CUSIP_LENGTH: Final = 9
ISIN_LENGTH: Final = 12

# Quantity: fractional shares and crypto need many decimal places.
QUANTITY_PRECISION: Final = 28
QUANTITY_SCALE: Final = 10
# A per-unit price: a fund's NAV has four decimals, a crypto price more.
PRICE_PRECISION: Final = 24
PRICE_SCALE: Final = 8

# A hand-entered holding: the largest quantity and price accepted, well above
# anything real, so a typo of extra digits is refused instead of stored.
MANUAL_MAX_QUANTITY: Final = 10**12
MANUAL_MAX_PRICE: Final = 10**9

# A price older than this many days is flagged on the Investments page. Plaid
# prices are as of the last market close, so a week covers weekends and
# holidays; a hand-entered price past it is worth re-checking.
PRICE_STALE_AFTER_DAYS: Final = 7
