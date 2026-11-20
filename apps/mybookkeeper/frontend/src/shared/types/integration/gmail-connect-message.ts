import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";

/** What the Gmail connect popup tells the page that opened it, once it has finished. */
export type GmailConnectMessage = { type: "gmail_connected" } | { type: "gmail_connect_failed"; reason: GmailConnectFailure };
