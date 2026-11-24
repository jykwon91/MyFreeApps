import type { PLAID_ITEM_STATUSES } from "../../constants/plaidItemStatuses";

/** A bank connection's health. Mirrors ``app/core/plaid_item_enums.py``. */
export type PlaidItemStatus = (typeof PLAID_ITEM_STATUSES)[number];
