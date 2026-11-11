/**
 * After a refresh, the backend scores the new postings in the background (~30s for the prefilter
 * top-N). The inbox polls this often while that plausibly runs, so verdicts fill in on their own.
 */
export const INBOX_POLL_INTERVAL_MS = 4000;

/**
 * How long after a refresh succeeds the inbox keeps polling and shows "Scoring". The
 * scorer only rates the top-N each day, so most postings stay unscored for good; past this the
 * poll stops and they settle on "Not scored".
 */
export const SCORING_WINDOW_MS = 60_000;
