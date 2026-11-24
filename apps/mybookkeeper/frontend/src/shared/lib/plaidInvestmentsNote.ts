import {
  PLAID_INVESTMENTS_STATUS_ACTIVE,
  PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED,
  PLAID_INVESTMENTS_STATUS_ERROR,
  PLAID_INVESTMENTS_STATUS_NOT_READY,
} from "@mybookkeeper/api-client/constants/plaidItemStatuses";
import type { PlaidItem } from "@mybookkeeper/api-client/types/plaid/plaid-item";
import { formatLastSynced } from "@mybookkeeper/api-client/utils/plaidItemFormat";
import { PLAID_MESSAGES as MSG } from "./plaid-messages";

/**
 * A second line about a connection's investment holdings, or null. A bank
 * that simply has none (``unavailable``) or hasn't been asked says nothing,
 * so a checking-only bank looks exactly as before.
 */
export function plaidInvestmentsNote(item: PlaidItem): string | null {
  switch (item.investments_status) {
    case PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED:
      return MSG.investmentsConsentNeeded;
    case PLAID_INVESTMENTS_STATUS_NOT_READY:
      return MSG.investmentsNotReady;
    case PLAID_INVESTMENTS_STATUS_ERROR:
      return MSG.investmentsFailed;
    case PLAID_INVESTMENTS_STATUS_ACTIVE:
      return item.holdings_synced_at ? MSG.holdingsSyncedAt(formatLastSynced(item.holdings_synced_at)) : null;
    default:
      return null;
  }
}
