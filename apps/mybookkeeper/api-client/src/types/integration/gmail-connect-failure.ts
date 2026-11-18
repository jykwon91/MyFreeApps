/** Why a Gmail connection didn't finish, as the callback tells the phone. Matches the server's `GmailConnectFailure`. */
export type GmailConnectFailure = "denied" | "expired" | "not_allowed" | "no_refresh_token" | "invalid_state" | "failed";
