"""Constants for personal spending categories.

Per project convention, enum-like columns are ``String(N)`` plus a
``CheckConstraint``, never SQLAlchemy ``Enum``.  These tuples are the single
source of truth, referenced from the model's constraints and the migration.

``TRANSACTION_SCOPES`` is mirrored in
``api-client/src/constants/transactionScopes.ts`` — a value added here MUST
be added there in the same PR.
"""

TRANSACTION_SCOPE_RENTAL = "rental"
TRANSACTION_SCOPE_BUSINESS = "business"
TRANSACTION_SCOPE_PERSONAL = "personal"

TRANSACTION_SCOPES: tuple[str, ...] = (
    TRANSACTION_SCOPE_RENTAL,
    TRANSACTION_SCOPE_BUSINESS,
    TRANSACTION_SCOPE_PERSONAL,
)

TRANSACTION_SCOPES_SQL = "('" + "', '".join(TRANSACTION_SCOPES) + "')"

# Default personal spending categories seeded for every new organization.
# ``is_default=True`` rows are never archived (the service guards this).
DEFAULT_SPENDING_CATEGORIES: tuple[str, ...] = (
    "Groceries",
    "Dining & restaurants",
    "Gas & fuel",
    "Shopping & retail",
    "Entertainment & recreation",
    "Travel & vacation",
    "Health & medical",
    "Subscriptions",
    "Personal utilities",
    "Other personal",
)

SPENDING_CATEGORY_NAME_MAX_LENGTH = 100
