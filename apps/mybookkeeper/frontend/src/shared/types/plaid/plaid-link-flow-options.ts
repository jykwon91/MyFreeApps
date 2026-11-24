import type { PlaidLinkSession } from "./plaid-link-session";

export interface PlaidLinkFlowOptions {
  /** On /plaid-oauth: the address the bank sent the person back to. */
  receivedRedirectUri?: string;
  /** On /plaid-oauth: the session started before the redirect, opened at once. */
  resume?: PlaidLinkSession | null;
  /** Called when Link closes without a new bank to confirm (exit, failure, reconnect done). */
  onSettled?: () => void;
}
