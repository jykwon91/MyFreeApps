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
 * How often, at the longest, the backend's SSE response sends something: while the tutor is
 * thinking it sends a keep-alive comment every 15 s (FastAPI's ``EventSourceResponse``).
 */
export const TURN_STREAM_KEEPALIVE_MS = 15_000;
/**
 * Longest silence between chunks of a turn's stream. The backend sends at least a keep-alive
 * every ``TURN_STREAM_KEEPALIVE_MS``, and its model call gives up after 45 s, so a healthy stream
 * is never quiet this long however long the reply runs. Past it the connection is treated as dropped.
 */
export const TURN_STREAM_IDLE_TIMEOUT_MS = 45_000;
/**
 * Once the app is back from the background, how long a turn whose whole reply has arrived may go
 * on receiving nothing before its connection is taken to have died (the phone may drop it while
 * asleep without telling the app). Counted from whatever came last, the coming back or the stream's
 * last data, and longer than the keep-alive, so a live connection is always heard from in time
 * while the server is still working out the turn's corrections.
 */
export const RESUMED_TURN_SILENCE_MS = TURN_STREAM_KEEPALIVE_MS + 5_000;
