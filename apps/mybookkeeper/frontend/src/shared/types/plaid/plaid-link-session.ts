/** A Link session started on this browser. ``itemId`` is set when it reconnects an existing bank. */
export interface PlaidLinkSession {
  linkToken: string;
  itemId: string | null;
}
