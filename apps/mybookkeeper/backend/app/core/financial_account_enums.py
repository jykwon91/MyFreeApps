"""Canonical string values for the financial accounts domain.

Per project convention, enum-like columns are ``String(N)`` plus a
``CheckConstraint``, never SQLAlchemy ``Enum``. These tuples are the single
source of truth, referenced from the model's ``CheckConstraint``s and from the
Alembic migration.

``ACCOUNT_TYPES`` and the two classification sets are mirrored in
``api-client/src/constants/financialAccountTypes.ts`` — a value added here MUST
be added there in the same PR.
"""

ACCOUNT_TYPE_CHECKING = "checking"
ACCOUNT_TYPE_SAVINGS = "savings"
ACCOUNT_TYPE_CREDIT_CARD = "credit_card"
ACCOUNT_TYPE_LOAN = "loan"
ACCOUNT_TYPE_MORTGAGE = "mortgage"
ACCOUNT_TYPE_BROKERAGE = "brokerage"
ACCOUNT_TYPE_RETIREMENT = "retirement"
ACCOUNT_TYPE_HSA = "hsa"
ACCOUNT_TYPE_CASH = "cash"
# "Other" has to say which side of the ledger it is on, or the totals cannot
# place it: a car is something you own, a family loan is something you owe.
ACCOUNT_TYPE_OTHER_ASSET = "other_asset"
ACCOUNT_TYPE_OTHER_LIABILITY = "other_liability"

ASSET_ACCOUNT_TYPES: frozenset[str] = frozenset({
    ACCOUNT_TYPE_CHECKING,
    ACCOUNT_TYPE_SAVINGS,
    ACCOUNT_TYPE_BROKERAGE,
    ACCOUNT_TYPE_RETIREMENT,
    ACCOUNT_TYPE_HSA,
    ACCOUNT_TYPE_CASH,
    ACCOUNT_TYPE_OTHER_ASSET,
})
LIABILITY_ACCOUNT_TYPES: frozenset[str] = frozenset({
    ACCOUNT_TYPE_CREDIT_CARD,
    ACCOUNT_TYPE_LOAN,
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPE_OTHER_LIABILITY,
})
# The accounts that hold securities: the ones the Investments page lists, a
# person can add holdings to, and a bank sync asks Plaid's holdings for.
INVESTMENT_ACCOUNT_TYPES: frozenset[str] = frozenset({
    ACCOUNT_TYPE_BROKERAGE,
    ACCOUNT_TYPE_RETIREMENT,
    ACCOUNT_TYPE_HSA,
})

# Display order on the Accounts page: everyday money first, debt last.
ACCOUNT_TYPES: tuple[str, ...] = (
    ACCOUNT_TYPE_CHECKING,
    ACCOUNT_TYPE_SAVINGS,
    ACCOUNT_TYPE_CASH,
    ACCOUNT_TYPE_BROKERAGE,
    ACCOUNT_TYPE_RETIREMENT,
    ACCOUNT_TYPE_HSA,
    ACCOUNT_TYPE_OTHER_ASSET,
    ACCOUNT_TYPE_CREDIT_CARD,
    ACCOUNT_TYPE_LOAN,
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPE_OTHER_LIABILITY,
)

ACCOUNT_TYPES_SQL = "('" + "', '".join(ACCOUNT_TYPES) + "')"

# Derived from the type, never stored: the two could otherwise disagree.
CLASSIFICATION_ASSET = "asset"
CLASSIFICATION_LIABILITY = "liability"

DEFAULT_CURRENCY = "USD"

NAME_MAX_LENGTH = 100
INSTITUTION_MAX_LENGTH = 255
# Plaid documents a mask as "the last 2-4 alphanumeric characters of an
# account's number". Capping the column at four is what makes storing a full
# account number impossible, not merely discouraged.
MASK_MIN_LENGTH = 2
MASK_MAX_LENGTH = 4
CURRENCY_LENGTH = 3
