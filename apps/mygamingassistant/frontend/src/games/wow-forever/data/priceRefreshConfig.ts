/** How often the page re-reads the house while a "Refresh now" runs. */
export const PRICE_REFRESH_POLL_MS = 3_000;
/** The page stops waiting after this long (Blizzard's answers are ~10 MB each). */
export const PRICE_REFRESH_WATCH_TIMEOUT_MS = 120_000;
/** Blizzard publishes a new snapshot of a house about this often. */
export const BLIZZARD_SNAPSHOT_INTERVAL_MS = 3_600_000;

export const PRICE_REFRESH_COPY = {
  button: "Refresh now",
  loading: "Refreshing…",
  success: "Prices updated from Blizzard's newest snapshot.",
  failed: "Blizzard didn't answer the refresh. The prices are unchanged; we'll try again soon.",
  slow: "The refresh is still running. Check back in a few minutes.",
  startFailed: "Couldn't start the refresh. Try again in a moment.",
  unavailable: "Price refreshes are switched off right now.",
  alreadyRunning: "A refresh is already running — prices will update shortly.",
  tooMany: "Too many refreshes from your connection. Try again in a few minutes.",
} as const;

/** Blizzard had nothing newer: say so plainly, with when to look again. */
export function priceRefreshUnchangedCopy(minutes: number): string {
  return `Blizzard hasn't published newer prices yet — try again in ~${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
