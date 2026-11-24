"""Canonical status values for ``plaid_items``.

``String(N)`` plus a ``CheckConstraint`` per project convention. Mirrored in
``api-client/src/constants/plaidItemStatuses.ts`` — a value added here MUST be
added there in the same PR.
"""
from typing import Final

PLAID_ITEM_STATUS_ACTIVE: Final = "active"
# The bank wants the person to sign in again (Link update mode).
PLAID_ITEM_STATUS_LOGIN_REQUIRED: Final = "login_required"
# Plaid refused for any other reason; ``error_code`` says which.
PLAID_ITEM_STATUS_ERROR: Final = "error"

PLAID_ITEM_STATUSES: Final[tuple[str, ...]] = (
    PLAID_ITEM_STATUS_ACTIVE,
    PLAID_ITEM_STATUS_LOGIN_REQUIRED,
    PLAID_ITEM_STATUS_ERROR,
)
PLAID_ITEM_STATUSES_SQL: Final = "('" + "', '".join(PLAID_ITEM_STATUSES) + "')"
PLAID_ITEM_STATUS_MAX_LENGTH: Final = 20
