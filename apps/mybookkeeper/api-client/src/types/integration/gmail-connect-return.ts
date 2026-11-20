import type { GmailConnectCompletion } from "./gmail-connect-completion";
import type { GmailConnectFailure } from "./gmail-connect-failure";

/** What Google's answer, sent on by the server, says: finish it with this code and state, or it ended at Google. */
export type GmailConnectReturn = ({ kind: "authorized" } & GmailConnectCompletion) | { kind: "failed"; reason: GmailConnectFailure };
