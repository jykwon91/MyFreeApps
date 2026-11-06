/**
 * Waits before asking again while an earlier attempt at the same reply is still
 * sending (409). About 30 seconds in all, then the app says it's taking a while.
 */
export const REPLY_IN_FLIGHT_RETRY_DELAYS_MS: readonly number[] = [2000, 3000, 5000, 5000, 5000, 5000, 5000];
