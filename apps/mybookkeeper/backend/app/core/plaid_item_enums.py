"""Canonical status values for ``plaid_items``.

``String(N)`` plus a ``CheckConstraint`` per project convention. Both lists are mirrored in
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

# Where an item stands on investment holdings, apart from its transactions
# status: a bank's holdings failing never marks the connection broken. NULL
# until the sync first asks (an item with no investment account never does).
#
# Holdings arrived on the last try.
PLAID_INVESTMENTS_STATUS_ACTIVE: Final = "active"
# The person has to allow investments in Link update mode ("Add investments").
PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED: Final = "consent_required"
# Plaid is still preparing them; the next sync or HOLDINGS webhook retries.
PLAID_INVESTMENTS_STATUS_NOT_READY: Final = "not_ready"
# This bank, or this server's Plaid account, doesn't offer them.
PLAID_INVESTMENTS_STATUS_UNAVAILABLE: Final = "unavailable"
# Any other refusal; retried on the next sync.
PLAID_INVESTMENTS_STATUS_ERROR: Final = "error"

PLAID_INVESTMENTS_STATUSES: Final[tuple[str, ...]] = (
    PLAID_INVESTMENTS_STATUS_ACTIVE,
    PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED,
    PLAID_INVESTMENTS_STATUS_NOT_READY,
    PLAID_INVESTMENTS_STATUS_UNAVAILABLE,
    PLAID_INVESTMENTS_STATUS_ERROR,
)
PLAID_INVESTMENTS_STATUSES_SQL: Final = "('" + "', '".join(PLAID_INVESTMENTS_STATUSES) + "')"
