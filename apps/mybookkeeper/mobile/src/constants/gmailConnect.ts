import { RECEIPTS_PENDING_TAG } from "@mybookkeeper/api-client/constants/receiptsPendingTag";
import type { TagDescription } from "@reduxjs/toolkit/query";

/**
 * Where the server sends Google's answer for a connection the phone started (its
 * `MOBILE_OAUTH_CALLBACK_URL`), for the app to finish signed in. The sign-in browser
 * closes when it gets here. The scheme is app.json's, so a dev build is needed: Expo Go has its own.
 */
export const GMAIL_CONNECT_RETURN_PATH = "oauth-callback";
export const GMAIL_CONNECT_RETURN_URL = `mybookkeeper://${GMAIL_CONNECT_RETURN_PATH}`;

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
