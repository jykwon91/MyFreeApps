"""Plaid bank-sync tunables and fixed wire values.

Environment URLs, the products MBK asks for, and the knobs the sync uses. No
secrets here: credentials come from ``PLAID_CLIENT_ID`` / ``PLAID_SECRET``
(``app/core/config.py``).
"""
from typing import Final

PLAID_ENVIRONMENT_URLS: Final[dict[str, str]] = {
    "sandbox": "https://sandbox.plaid.com",
    "production": "https://production.plaid.com",
}

PLAID_CLIENT_NAME: Final = "MyBookkeeper"
PLAID_PRODUCTS: Final[tuple[str, ...]] = ("transactions",)
PLAID_COUNTRY_CODES: Final[tuple[str, ...]] = ("US",)
PLAID_LANGUAGE: Final = "en"

# Two years of history on the first sync — enough for this and last tax year.
# Plaid's default is 90 days, and the value can only be set when the item is
# created, so it has to be generous up front.
PLAID_TRANSACTIONS_DAYS_REQUESTED: Final = 730

# Plaid's own cap on /transactions/sync page size.
PLAID_SYNC_PAGE_SIZE: Final = 500
# A sync that keeps hitting TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION
# restarts from its first cursor this many times before giving up until the
# next trigger.
PLAID_SYNC_MAX_RESTARTS: Final = 3

PLAID_HTTP_TIMEOUT_SECONDS: Final = 30.0

# The path Plaid posts webhooks to, behind the public origin
# (``FRONTEND_URL``). Docker Caddy strips ``/api`` before the backend sees it.
PLAID_WEBHOOK_PATH: Final = "/api/plaid/webhook"

# Webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/).
PLAID_VERIFICATION_HEADER: Final = "Plaid-Verification"
PLAID_WEBHOOK_JWT_ALGORITHM: Final = "ES256"
PLAID_WEBHOOK_MAX_AGE_SECONDS: Final = 300
PLAID_VERIFICATION_KEY_CACHE_SECONDS: Final = 24 * 60 * 60

# Stored on every transaction the sync creates (``transactions.external_source``).
PLAID_EXTERNAL_SOURCE: Final = "plaid"

# The two legs of a transfer between banks post up to a few business days
# apart, so a counterpart is looked for this many calendar days either side.
PLAID_TRANSFER_MATCH_WINDOW_DAYS: Final = 5

# Plaid error codes the app routes on
# (https://plaid.com/docs/errors/item/, /errors/transactions/).
PLAID_ERROR_ITEM_LOGIN_REQUIRED: Final = "ITEM_LOGIN_REQUIRED"
PLAID_ERROR_ITEM_NOT_FOUND: Final = "ITEM_NOT_FOUND"
PLAID_ERROR_MUTATION_DURING_PAGINATION: Final = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
# Item states that need the person to sign in to their bank again.
PLAID_REAUTH_ERROR_CODES: Final[frozenset[str]] = frozenset({
    PLAID_ERROR_ITEM_LOGIN_REQUIRED,
    "PENDING_EXPIRATION",
    "PENDING_DISCONNECT",
})

# Webhook types and codes the app acts on.
PLAID_WEBHOOK_TYPE_TRANSACTIONS: Final = "TRANSACTIONS"
PLAID_WEBHOOK_TYPE_ITEM: Final = "ITEM"
PLAID_WEBHOOK_SYNC_UPDATES_AVAILABLE: Final = "SYNC_UPDATES_AVAILABLE"
PLAID_WEBHOOK_ITEM_ERROR: Final = "ERROR"
PLAID_WEBHOOK_LOGIN_REPAIRED: Final = "LOGIN_REPAIRED"
PLAID_WEBHOOK_ITEM_REAUTH_CODES: Final[frozenset[str]] = frozenset({
    "PENDING_EXPIRATION",
    "PENDING_DISCONNECT",
})
PLAID_WEBHOOK_USER_PERMISSION_REVOKED: Final = "USER_PERMISSION_REVOKED"

# Longest values accepted from the Link front end for display-only fields.
PLAID_INSTITUTION_ID_MAX_LENGTH: Final = 50
PLAID_ID_MAX_LENGTH: Final = 100
PLAID_PUBLIC_TOKEN_MAX_LENGTH: Final = 200
PLAID_ERROR_CODE_MAX_LENGTH: Final = 100
PLAID_ERROR_TYPE_MAX_LENGTH: Final = 50

# ``chk_txn_tax_year`` floor. Plaid can return older history for some banks;
# those rows are skipped rather than violating the constraint.
PLAID_MIN_TRANSACTION_YEAR: Final = 2020
