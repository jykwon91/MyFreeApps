import type { GmailConnectFailure } from "../types/integration/gmail-connect-failure";

/** The `result` the server sends back with a `reason` when the connection ended at Google. */
export const GMAIL_CONNECT_RESULT_ERROR = "error";

/** Every reason the server can give. Anything else is read as `failed`. */
export const GMAIL_CONNECT_FAILURES: readonly GmailConnectFailure[] = ["denied", "expired", "not_allowed", "no_refresh_token", "wrong_account", "invalid_state", "failed"];

/** Why the connection didn't finish, in the person's words. */
export const GMAIL_CONNECT_FAILURE_MESSAGES: Readonly<Record<GmailConnectFailure, string>> = {
  denied: "Google says you didn't allow it, so Gmail isn't connected. Try again whenever you're ready.",
  expired: "That took a little too long, so I stopped. Try connecting again.",
  not_allowed: "You can't connect Gmail for this workspace any more. Ask one of its admins.",
  no_refresh_token: "Google didn't give me what I need to stay connected. Try connecting again.",
  wrong_account: "This Gmail connection was started from a different MyBookkeeper account, so I didn't connect it. To connect your Gmail, start from your own account.",
  invalid_state: "Something got mixed up between me and Google. Try connecting again.",
  failed: "I couldn't connect Gmail. Want to try again?",
};
