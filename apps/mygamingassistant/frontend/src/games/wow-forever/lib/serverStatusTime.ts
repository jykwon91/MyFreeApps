/**
 * Formats an ISO 8601 UTC timestamp as a human-readable relative time string.
 *
 * Used by the server-status section to show when Blizzard's status was last
 * fetched — intentionally coarse so small clock drift doesn't confuse readers.
 */
export function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 10) return "just now";
  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes === 1) return "1 minute ago";
  return `${diffMinutes} minutes ago`;
}
