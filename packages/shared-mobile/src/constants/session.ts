export const STORED_SESSION_KEY = "platform.session";

/** Signing out shouldn't sit on a spinner because the network has gone quiet. */
export const LOGOUT_TIMEOUT_MS = 5000;

/** A refresh that never answers would hold up every request waiting for it. */
export const AUTH_REQUEST_TIMEOUT_MS = 15000;
