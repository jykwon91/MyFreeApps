/**
 * A moment in the reader's own time zone ("Sat, Nov 7, 2:05 PM" in en-US). `timeZone` is for tests;
 * the page always leaves it out so the browser's zone is used.
 */
export function formatLocalDateTime(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(ms);
}

/** The reader's time zone name ("America/Chicago"), for the "times are in your time zone" note. */
export function localTimeZoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
