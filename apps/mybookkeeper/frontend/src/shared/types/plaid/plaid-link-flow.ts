import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";

export interface PlaidLinkFlow {
  /** Open Link for a new bank (null) or to reconnect the given connection. */
  begin: (itemId: string | null) => Promise<void>;
  /** What is being opened: a connection id, null for a new bank, undefined when nothing is. */
  starting: string | null | undefined;
  /** Link finished for a new bank; the person still says what each account is. */
  pending: PlaidPendingConnection | null;
  clearPending: () => void;
}
