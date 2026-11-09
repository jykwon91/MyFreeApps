/** How often to re-read the email queue while a sync or extraction is in flight. */
export const SYNC_ACTIVE_POLL_INTERVAL_MS = 5_000;
/** How often to re-read it when nothing is running, just to notice that something started. */
export const SYNC_IDLE_POLL_INTERVAL_MS = 60_000;
