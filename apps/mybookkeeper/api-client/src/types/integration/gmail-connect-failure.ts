/** Why a Gmail connection didn't finish, as the server tells the app. Matches the server's `GmailConnectFailure`. */
export type GmailConnectFailure = "denied" | "expired" | "not_allowed" | "no_refresh_token" | "wrong_account" | "invalid_state" | "failed";
