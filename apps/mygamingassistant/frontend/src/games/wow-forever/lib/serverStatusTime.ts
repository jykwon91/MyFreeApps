const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function plural(n: number, unit: string): string {
  return n === 1 ? `1 ${unit} ago` : `${n} ${unit}s ago`;
}

/**
 * Formats an ISO 8601 UTC timestamp as a human-readable relative time string.
 *
 * Used for when Blizzard's server status was last fetched and when the
 * auction-house prices were updated. It's coarse on purpose, so small clock
 * drift doesn't confuse readers.
 */
export function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < MINUTES_PER_HOUR) return plural(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / MINUTES_PER_HOUR);
  if (diffHours < HOURS_PER_DAY) return plural(diffHours, "hour");
  return plural(Math.round(diffHours / HOURS_PER_DAY), "day");
}
