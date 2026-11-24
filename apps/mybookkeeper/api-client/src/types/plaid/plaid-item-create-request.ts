import type { PlaidAccountSelection } from "./plaid-account-selection";

/** Finish connecting a bank: Link's public token plus what to do with each account. */
export interface PlaidItemCreateRequest {
  public_token: string;
  institution_id: string | null;
  institution_name: string | null;
  accounts: PlaidAccountSelection[];
}
