/**
 * Ask for a Plaid Link token. With ``item_id`` Link opens in update mode to
 * reconnect that bank; with ``add_investments`` too, to allow investment holdings on it.
 */
export interface PlaidLinkTokenRequest {
  item_id?: string | null;
  add_investments?: boolean;
}
