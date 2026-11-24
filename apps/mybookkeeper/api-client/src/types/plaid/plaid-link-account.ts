/**
 * One account Plaid Link says the person chose, in the shape both the web and
 * phone code can hold (no Plaid SDK types here).
 */
export interface PlaidLinkAccount {
  id: string;
  name: string;
  mask: string | null;
  /** Plaid's account type: depository, credit, loan, investment, other. */
  type: string;
  subtype: string | null;
}
