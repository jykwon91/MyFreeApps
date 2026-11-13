/** How often the page re-reads the guild while a "Refresh now" runs. */
export const GUILD_REFRESH_POLL_MS = 3_000;
/** The page stops waiting after this long (a big guild is finished by its hourly refreshes). */
export const GUILD_REFRESH_WATCH_TIMEOUT_MS = 120_000;

export const GUILD_REFRESH_MS_PER_MINUTE = 60_000;

export const GUILD_REFRESH_COPY = {
  button: "Refresh now",
  loading: "Refreshing…",
  success: "Guild refreshed — the roster and members are up to date.",
  failed: "Blizzard didn't answer the refresh. The list is unchanged; we'll try again soon.",
  slow: "The refresh is still running. Check back in a few minutes.",
  startFailed: "Couldn't start the refresh. Try again in a moment.",
  tooMany: "Too many refreshes from your connection. Try again in a few minutes.",
} as const;

/** The refresh was asked for too recently, whether by a click, the hourly refresh or a failed try. */
export function guildRefreshCooldownCopy(minutes: number): string {
  return `Refreshed recently — you can refresh again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
