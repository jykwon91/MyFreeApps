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

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
