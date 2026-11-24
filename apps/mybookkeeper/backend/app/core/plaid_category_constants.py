"""How Plaid's account types and spending categories map onto MBK's.

Account types: Plaid reports ``type`` + ``subtype``
(https://plaid.com/docs/api/accounts/#account-type-schema). A subtype match
wins; otherwise the type decides.

Spending categories: Plaid's ``personal_finance_category``
(https://plaid.com/docs/transactions/pfc-migration/) is mapped to one of the
default personal categories (``DEFAULT_SPENDING_CATEGORIES``) only where the
match is obvious. Anything else stays uncategorized for the person to file.
"""
from typing import Final

from app.core.financial_account_enums import (
    ACCOUNT_TYPE_BROKERAGE,
    ACCOUNT_TYPE_CHECKING,
    ACCOUNT_TYPE_CREDIT_CARD,
    ACCOUNT_TYPE_HSA,
    ACCOUNT_TYPE_LOAN,
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPE_OTHER_ASSET,
    ACCOUNT_TYPE_RETIREMENT,
    ACCOUNT_TYPE_SAVINGS,
)

PLAID_SUBTYPE_TO_ACCOUNT_TYPE: Final[dict[str, str]] = {
    "checking": ACCOUNT_TYPE_CHECKING,
    "savings": ACCOUNT_TYPE_SAVINGS,
    "money market": ACCOUNT_TYPE_SAVINGS,
    "cd": ACCOUNT_TYPE_SAVINGS,
    "hsa": ACCOUNT_TYPE_HSA,
    "credit card": ACCOUNT_TYPE_CREDIT_CARD,
    "paypal": ACCOUNT_TYPE_CHECKING,
    "mortgage": ACCOUNT_TYPE_MORTGAGE,
    "home equity": ACCOUNT_TYPE_LOAN,
    "brokerage": ACCOUNT_TYPE_BROKERAGE,
    "401k": ACCOUNT_TYPE_RETIREMENT,
    "403b": ACCOUNT_TYPE_RETIREMENT,
    "457b": ACCOUNT_TYPE_RETIREMENT,
    "ira": ACCOUNT_TYPE_RETIREMENT,
    "roth": ACCOUNT_TYPE_RETIREMENT,
    "roth 401k": ACCOUNT_TYPE_RETIREMENT,
    "sep ira": ACCOUNT_TYPE_RETIREMENT,
    "simple ira": ACCOUNT_TYPE_RETIREMENT,
    "pension": ACCOUNT_TYPE_RETIREMENT,
}

PLAID_TYPE_TO_ACCOUNT_TYPE: Final[dict[str, str]] = {
    "depository": ACCOUNT_TYPE_CHECKING,
    "credit": ACCOUNT_TYPE_CREDIT_CARD,
    "loan": ACCOUNT_TYPE_LOAN,
    "investment": ACCOUNT_TYPE_BROKERAGE,
}

# Plaid account types MBK has no closer match for.
PLAID_FALLBACK_ACCOUNT_TYPE: Final = ACCOUNT_TYPE_OTHER_ASSET

# Detailed categories are checked before primary ones.
PFC_DETAILED_TO_SPENDING_CATEGORY: Final[dict[str, str]] = {
    "FOOD_AND_DRINK_GROCERIES": "Groceries",
    "TRANSPORTATION_GAS": "Gas & fuel",
}

# Detailed categories that must NOT inherit their primary's mapping: rent is a
# housing cost, not a utility.
PFC_DETAILED_UNMAPPED: Final[frozenset[str]] = frozenset({"RENT_AND_UTILITIES_RENT"})

PFC_PRIMARY_TO_SPENDING_CATEGORY: Final[dict[str, str]] = {
    "FOOD_AND_DRINK": "Dining & restaurants",
    "GENERAL_MERCHANDISE": "Shopping & retail",
    "ENTERTAINMENT": "Entertainment & recreation",
    "TRAVEL": "Travel & vacation",
    "MEDICAL": "Health & medical",
    "RENT_AND_UTILITIES": "Personal utilities",
}

# Primary categories that mark one leg of money moving between accounts.
# Only legs carrying one of these are paired into a transfer, so a refund on
# one card and a purchase on another for the same amount never are.
PFC_TRANSFER_PRIMARIES: Final[frozenset[str]] = frozenset({
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "LOAN_PAYMENTS",
})
