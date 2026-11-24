import type { PlaidLinkAccount } from "./plaid-link-account";

/** Link finished; the person still has to say what each account is before it is saved. */
export interface PlaidPendingConnection {
  publicToken: string;
  institutionId: string | null;
  institutionName: string | null;
  accounts: PlaidLinkAccount[];
}
