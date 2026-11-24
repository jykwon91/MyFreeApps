import { PLAID_ITEM_STATUS_ERROR, PLAID_ITEM_STATUS_LOGIN_REQUIRED } from "@mybookkeeper/api-client/constants/plaidItemStatuses";
import type { PlaidItem } from "@mybookkeeper/api-client/types/plaid/plaid-item";
import { formatLastSynced } from "@mybookkeeper/api-client/utils/plaidItemFormat";
import { PLAID_MESSAGES as MSG } from "./plaid-messages";

/** The one line under a connection's name: what's wrong with it, or when it last synced. */
export function plaidItemStatusNote(item: PlaidItem): string {
  if (item.status === PLAID_ITEM_STATUS_LOGIN_REQUIRED) return MSG.needsSignIn;
  if (item.status === PLAID_ITEM_STATUS_ERROR) return MSG.brokenConnection;
  return item.last_synced_at ? MSG.syncedAt(formatLastSynced(item.last_synced_at)) : MSG.neverSynced;
}
