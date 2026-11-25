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
# Consent asked for at Link but no data pulled, so a bank without investment
# accounts still links and nothing is billed until ``/investments/holdings/get``
# is called — which the sync does only for an item with an investment account.
# Plaid's recommendation for personal finance:
# https://plaid.com/docs/link/initializing-products/ ("Transactions with
# Liabilities and/or Investments"). Not ``optional_products``: that bills
# Investments at item creation on every item it can be added to.
PLAID_ADDITIONAL_CONSENTED_PRODUCTS: Final[tuple[str, ...]] = ("investments",)
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

# The page OAuth banks (Chase) send the person back to, behind the same
# origin. ``FRONTEND_URL`` + this path must be registered in the Plaid
# dashboard (Team Settings > API > Allowed redirect URIs).
PLAID_OAUTH_REDIRECT_PATH: Final = "/plaid-oauth"

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

# How far apart a synced row and the same money already on file from an email
# or document may be dated. A person-to-person payment (matched on the payer's
# name too) is read from the alert the day it is sent and posts a few days
# later; any other row is matched on its vendor and posts within a few days of
# the bill or receipt.
PLAID_COPY_MATCH_WINDOW_DAYS_P2P: Final = 4
PLAID_COPY_MATCH_WINDOW_DAYS_OTHER: Final = 3
# A vendor shorter than this, once normalized, is too generic to match on.
PLAID_COPY_MIN_VENDOR_LENGTH: Final = 4
# Payment rails, not payees: a row filed under one of these says how the money
# moved, not who it went to, so it can only be matched on the payer's name.
PLAID_COPY_P2P_RAILS: Final[frozenset[str]] = frozenset({
    "zelle", "venmo", "cashapp", "paypal", "wise",
})

# Plaid error codes the app routes on
# (https://plaid.com/docs/errors/item/, /errors/transactions/).
PLAID_ERROR_ITEM_LOGIN_REQUIRED: Final = "ITEM_LOGIN_REQUIRED"
PLAID_ERROR_ITEM_NOT_FOUND: Final = "ITEM_NOT_FOUND"
PLAID_ERROR_MUTATION_DURING_PAGINATION: Final = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
# The client's Plaid account isn't enabled for a product it asked for
# (https://plaid.com/docs/errors/invalid-input/#invalid_product).
PLAID_ERROR_INVALID_PRODUCT: Final = "INVALID_PRODUCT"

# What ``/investments/holdings/get`` can answer with that means "no holdings
# from this item right now", by what the app does about it
# (https://plaid.com/docs/errors/item/, /errors/invalid-input/).
# The person has to grant consent in Link update mode.
PLAID_ERROR_ADDITIONAL_CONSENT_REQUIRED: Final = "ADDITIONAL_CONSENT_REQUIRED"
# Plaid is still preparing the data; the HOLDINGS webhook or the next sync
# picks it up.
PLAID_ERROR_PRODUCT_NOT_READY: Final = "PRODUCT_NOT_READY"
# The item can never give holdings as it stands.
PLAID_HOLDINGS_UNAVAILABLE_CODES: Final[frozenset[str]] = frozenset({
    "PRODUCTS_NOT_SUPPORTED",
    "NO_INVESTMENT_ACCOUNTS",
    PLAID_ERROR_INVALID_PRODUCT,
})
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
# https://plaid.com/docs/api/products/investments/ (HOLDINGS: DEFAULT_UPDATE)
PLAID_WEBHOOK_TYPE_HOLDINGS: Final = "HOLDINGS"
PLAID_WEBHOOK_HOLDINGS_DEFAULT_UPDATE: Final = "DEFAULT_UPDATE"

# Longest values accepted from the Link front end for display-only fields.
PLAID_INSTITUTION_ID_MAX_LENGTH: Final = 50
PLAID_ID_MAX_LENGTH: Final = 100
PLAID_PUBLIC_TOKEN_MAX_LENGTH: Final = 200
PLAID_ERROR_CODE_MAX_LENGTH: Final = 100
PLAID_ERROR_TYPE_MAX_LENGTH: Final = 50

# ``chk_txn_tax_year`` floor. Plaid can return older history for some banks;
# those rows are skipped rather than violating the constraint.
PLAID_MIN_TRANSACTION_YEAR: Final = 2020
