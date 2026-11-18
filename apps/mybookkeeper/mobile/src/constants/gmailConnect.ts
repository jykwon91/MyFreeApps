import { RECEIPTS_PENDING_TAG } from "@mybookkeeper/api-client/constants/receiptsPendingTag";
import type { GmailConnectFailure } from "@mybookkeeper/api-client/types/integration/gmail-connect-failure";
import type { TagDescription } from "@reduxjs/toolkit/query";

/**
 * Where the server sends Google's answer for a connection the phone started (its
 * `MOBILE_OAUTH_CALLBACK_URL`). The sign-in browser closes when it gets here. The
 * scheme is app.json's, so a dev build is needed: Expo Go has its own.
 */
export const GMAIL_CONNECT_RETURN_PATH = "oauth-callback";
export const GMAIL_CONNECT_RETURN_URL = `mybookkeeper://${GMAIL_CONNECT_RETURN_PATH}`;
export const GMAIL_CONNECT_RESULT_CONNECTED = "connected";
export const GMAIL_CONNECT_RESULT_ERROR = "error";

/** Every reason the server can send back. Anything else is read as `failed`. */
export const GMAIL_CONNECT_FAILURES: readonly GmailConnectFailure[] = ["denied", "expired", "not_allowed", "no_refresh_token", "invalid_state", "failed"];

/** What changes once Gmail is connected: the connection itself, and whether receipts can be emailed. */
export const GMAIL_CONNECTED_TAGS: TagDescription<"Integration" | "SignedLease">[] = ["Integration", RECEIPTS_PENDING_TAG];

export const GMAIL_CONNECT_MESSAGES = {
  connect: "Connect Gmail",
  reconnect: "Reconnect Gmail",
  opening: "Opening Google...",
  opensGoogle: "Opens Google's sign-in",
  connected: "Gmail's connected.",
  couldntOpen: "I couldn't open Google's sign-in. Want to try again?",
  couldntReach: "I couldn't reach the server to start connecting Gmail. Want to try again?",
} as const;

/** Why the connection didn't finish, in the person's words. */
export const GMAIL_CONNECT_FAILURE_MESSAGES: Readonly<Record<GmailConnectFailure, string>> = {
  denied: "Google says you didn't allow it, so Gmail isn't connected. Try again whenever you're ready.",
  expired: "That took a little too long, so I stopped. Try connecting again.",
  not_allowed: "You can't connect Gmail for this workspace any more. Ask one of its admins.",
  no_refresh_token: "Google didn't give me what I need to stay connected. Try connecting again.",
  invalid_state: "Something got mixed up between me and Google. Try connecting again.",
  failed: "I couldn't connect Gmail. Want to try again?",
};
