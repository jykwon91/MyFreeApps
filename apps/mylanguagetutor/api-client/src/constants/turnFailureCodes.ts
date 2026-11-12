/**
 * Turn failure codes the client raises itself or reacts to by name.
 * Shared so web and phone use the same strings: ``turnErrorCopy`` is keyed by
 * them (``no_stream`` gets its generic line).
 */
/** The stream closed before ``done`` arrived. */
export const CONNECTION_LOST = "connection_lost";
/** ``POST /sessions`` failed, so there was no conversation to send the turn to. */
export const SESSION_CREATE_FAILED = "session_create_failed";
/** The backend no longer knows the session (HTTP 404 ``detail``). */
export const SESSION_NOT_FOUND = "session_not_found";
/** The turn was accepted but the response carried no body to stream. */
export const NO_STREAM = "no_stream";
/** The request never got an HTTP answer (offline, DNS, dropped connection). */
export const NETWORK_ERROR = "network_error";
