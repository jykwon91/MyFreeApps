"""Canonical values for the monthly expenses page.

``MONTHLY_EXPENSE_RANGES`` is mirrored in
``api-client/src/constants/monthlyExpenses.ts`` — a value added here MUST be
added there in the same PR. The scopes are the cash flow page's
(``CASH_FLOW_SCOPES``).
"""
from typing import Final

from app.core.budget_constants import DEFAULT_CASH_FLOW_SCOPE
from app.core.spending_category_enums import SPENDING_CATEGORY_NAME_MAX_LENGTH

RANGE_3M = "3m"
RANGE_6M = "6m"
RANGE_12M = "12m"
# Full calendar months each range averages, ending with last month: the
# month in progress would pull every average down.
MONTHLY_EXPENSE_RANGE_MONTHS: Final[dict[str, int]] = {
    RANGE_3M: 3,
    RANGE_6M: 6,
    RANGE_12M: 12,
}
MONTHLY_EXPENSE_RANGES: Final[tuple[str, ...]] = tuple(MONTHLY_EXPENSE_RANGE_MONTHS)
DEFAULT_MONTHLY_EXPENSE_RANGE: Final = RANGE_6M
DEFAULT_MONTHLY_EXPENSE_SCOPE: Final = DEFAULT_CASH_FLOW_SCOPE

# A row typed in by hand or read off an email/document, with no account, is
# the same payment as a bank-synced row of the same amount and type dated
# this many days either side of it.
BANK_TWIN_WINDOW_DAYS: Final = 4

# A loan-payment row leaving checking is a credit-card payment when a payment
# of the same amount lands on a card within this many days.
CARD_PAYMENT_MATCH_WINDOW_DAYS: Final = 5

# Plaid ``personal_finance_category.primary`` values the rules look at.
PFC_LOAN_PAYMENTS: Final = "LOAN_PAYMENTS"
PFC_TRANSFER_OUT: Final = "TRANSFER_OUT"

# A holder's name has to be at least this many words before a description
# containing it is read as money sent to themselves: "Jason" alone would also
# match "Jason's Deli".
SELF_TRANSFER_MIN_NAME_WORDS: Final = 2

LABEL_MORTGAGE: Final = "Mortgage"
LABEL_LOANS: Final = "Car & other loans"
LABEL_OTHER: Final = "Other"
# A heading is a spending category name or one of the labels here.
EXPENSE_LABEL_MAX_LENGTH: Final = SPENDING_CATEGORY_NAME_MAX_LENGTH

# MBK categories that already say what the money was for. ``other_expense``
# and ``uncategorized`` say nothing, so those rows fall through to the bank's
# category.
CATEGORY_TO_EXPENSE_LABEL: Final[dict[str, str]] = {
    "maintenance": "Repairs & maintenance",
    "contract_work": "Contract work",
    "cleaning_expense": "Cleaning",
    "utilities": "Utilities & phone",
    "management_fee": "Management fees",
    "insurance": "Insurance",
    "mortgage_interest": LABEL_MORTGAGE,
    "mortgage_principal": LABEL_MORTGAGE,
    "taxes": "Taxes",
    "channel_fee": "Booking platform fees",
    "advertising": "Advertising",
    "legal_professional": "Legal & professional",
    "travel": "Travel",
    "furnishings": "Furnishings",
    "supplies": "Supplies",
    "home_office": "Home office",
    "meals": "Food & dining",
    "vehicle_expenses": "Transportation",
    "health_insurance": "Medical",
    "education_training": "Education",
}

# Plaid's primary category, as a person would say it. Loan payments are
# decided by the rules, not this table.
PFC_TO_EXPENSE_LABEL: Final[dict[str, str]] = {
    "FOOD_AND_DRINK": "Food & dining",
    "RENT_AND_UTILITIES": "Utilities & phone",
    "GENERAL_MERCHANDISE": "Shopping",
    "GENERAL_SERVICES": "Services",
    "HOME_IMPROVEMENT": "Home improvement",
    "ENTERTAINMENT": "Entertainment",
    "MEDICAL": "Medical",
    "TRANSPORTATION": "Transportation",
    "TRAVEL": "Travel",
    "PERSONAL_CARE": "Personal care",
    "GOVERNMENT_AND_NON_PROFIT": "Government & fees",
    "BANK_FEES": "Government & fees",
    PFC_TRANSFER_OUT: "Money sent to people",
}

# How a payment app's row names the person paid: "Zelle payment to Silvia" was
# paid to Silvia. Matched case-insensitively at the start of the name.
PAYEE_PREFIXES: Final[tuple[str, ...]] = (
    "zelle payment to ",
    "zelle to ",
    "venmo payment to ",
    "venmo to ",
    "cash app payment to ",
    "paypal payment to ",
)
UNKNOWN_PAYEE: Final = "Unknown payee"
