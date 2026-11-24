import type { PlaidPendingConnection } from "@mybookkeeper/api-client/types/plaid/plaid-pending-connection";
import type { PlaidLinkBeginOptions } from "./plaid-link-begin-options";

export interface PlaidLinkFlow {
  /** Open Link for a new bank (null), or on the given connection to reconnect it or add investments. */
  begin: (itemId: string | null, options?: PlaidLinkBeginOptions) => Promise<void>;
  /** What is being opened: a connection id, null for a new bank, undefined when nothing is. */
  starting: string | null | undefined;
  /** Link finished for a new bank; the person still says what each account is. */
  pending: PlaidPendingConnection | null;
  clearPending: () => void;
}
