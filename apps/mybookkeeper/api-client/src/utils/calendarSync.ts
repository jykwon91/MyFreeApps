import type { CalendarEvent } from "../types/calendar/calendar-event";

/** The most recent `updated_at` across the events, or null when there are none. */
export function lastSyncedAt(events: readonly CalendarEvent[]): string | null {
  if (events.length === 0) return null;
  let max = events[0].updated_at;
  for (const e of events) {
    if (e.updated_at > max) max = e.updated_at;
  }
  return max;
}
