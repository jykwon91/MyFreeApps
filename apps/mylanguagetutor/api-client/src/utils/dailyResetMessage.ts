import { nextUtcMidnight } from "./nextUtcMidnight";

const DAY_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" };
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * When today's practice time comes back, in the learner's own clock, e.g.
 * "today at 6:00 PM" (a Chicago learner) or "tomorrow at 9:00 AM" (Tokyo).
 * The quota rolls over at 00:00 UTC, which is not the learner's midnight.
 */
export function dailyResetWhen(now: Date, timeZone?: string): string {
  const reset = nextUtcMidnight(now);
  const sameLocalDay = now.toLocaleDateString("en-US", { ...DAY_OPTIONS, timeZone }) === reset.toLocaleDateString("en-US", { ...DAY_OPTIONS, timeZone });
  const time = reset.toLocaleTimeString("en-US", { ...TIME_OPTIONS, timeZone });
  return `${sameLocalDay ? "today" : "tomorrow"} at ${time}`;
}
