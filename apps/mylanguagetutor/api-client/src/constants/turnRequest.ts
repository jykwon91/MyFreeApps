/** ``TurnRequestError.status`` used when the network failed before any HTTP response. */
export const NETWORK_ERROR_STATUS = 0;
/**
 * Longest wait for a turn's response headers. The backend answers as soon as the turn is
 * reserved (a few database queries) and sends ``turn.started`` straight away, so a slow phone
 * link still answers well within this; it matches the phone's default API request time limit.
 * Past it the connection is treated as dropped.
 */
export const TURN_RESPONSE_TIMEOUT_MS = 30_000;
/**
 * Longest silence between chunks of a turn's stream. While the tutor is thinking the backend's
 * SSE response sends a keep-alive comment every 15 s (FastAPI's ``EventSourceResponse``), and
 * its model call gives up after 45 s, so a healthy stream is never quiet this long however long
 * the reply runs. Past it the connection is treated as dropped.
 */
export const TURN_STREAM_IDLE_TIMEOUT_MS = 45_000;
