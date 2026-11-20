import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";

/** Where finishing a Gmail connection in the popup has got to. */
export type GmailConnectFinish = { kind: "connecting" } | { kind: "connected" } | { kind: "failed"; reason: GmailConnectFailure };
