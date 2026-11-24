/** Ask for a Plaid Link token. With ``item_id`` Link opens in update mode to reconnect that bank. */
export interface PlaidLinkTokenRequest {
  item_id?: string | null;
}
