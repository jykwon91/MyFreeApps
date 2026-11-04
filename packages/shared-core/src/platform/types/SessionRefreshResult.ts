/**
 * - `refreshed`: there's a new access token in the token store.
 * - `signed_out`: the server says this session is over.
 * - `unavailable`: no answer (offline, rate limited, server error). The session may
 *   well be fine, so the user stays signed in.
 */
export type SessionRefreshResult = "refreshed" | "signed_out" | "unavailable";
