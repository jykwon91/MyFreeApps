import type { PLAID_INVESTMENTS_STATUSES } from "../../constants/plaidItemStatuses";

/** Where a bank connection stands on investment holdings. Mirrors ``app/core/plaid_item_enums.py``. */
export type PlaidInvestmentsStatus = (typeof PLAID_INVESTMENTS_STATUSES)[number];
