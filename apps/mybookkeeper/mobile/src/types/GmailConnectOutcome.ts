import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";

/** How a trip to Google's sign-in ended. */
export type GmailConnectOutcome = { kind: "connected" } | { kind: "closed" } | { kind: "failed"; reason: GmailConnectFailure };
