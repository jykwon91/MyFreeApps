/**
 * A Link session started on this browser. ``itemId`` is set when it reopens an
 * existing bank; ``addInvestments`` when that was to allow investment holdings.
 */
export interface PlaidLinkSession {
  linkToken: string;
  itemId: string | null;
  addInvestments?: boolean;
}
