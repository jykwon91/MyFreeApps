/** Mirrors ``PLAID_ITEM_STATUSES`` in ``backend/app/core/plaid_item_enums.py``. */
export const PLAID_ITEM_STATUSES = ["active", "login_required", "error"] as const;

export const PLAID_ITEM_STATUS_ACTIVE = "active";
export const PLAID_ITEM_STATUS_LOGIN_REQUIRED = "login_required";
export const PLAID_ITEM_STATUS_ERROR = "error";

/** Mirrors ``PLAID_INVESTMENTS_STATUSES``: where a connection stands on investment holdings. */
export const PLAID_INVESTMENTS_STATUSES = ["active", "consent_required", "not_ready", "unavailable", "error"] as const;

export const PLAID_INVESTMENTS_STATUS_ACTIVE = "active";
export const PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED = "consent_required";
export const PLAID_INVESTMENTS_STATUS_NOT_READY = "not_ready";
export const PLAID_INVESTMENTS_STATUS_ERROR = "error";
