import type { GmailConnectReturn } from "@mybookkeeper/api-client/types/integration/gmail-connect-return";

/** How a trip to Google's sign-in ended: closed, or Google's answer as the server sent it on. */
export type GmailConnectOutcome = { kind: "closed" } | GmailConnectReturn;
