export const STORED_SESSION_KEY = "platform.session";

/** Signing out shouldn't sit on a spinner because the network has gone quiet. */
export const LOGOUT_TIMEOUT_MS = 5000;

/** A refresh that never answers would hold up every request waiting for it. */
export const AUTH_REQUEST_TIMEOUT_MS = 15000;

/** Clearing years of records takes a while, and giving up early leaves the answer unknown. */
export const DELETE_ACCOUNT_TIMEOUT_MS = 60000;
