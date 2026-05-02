import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

/**
 * Pure helpers for the unified calendar viewer.
 *
 * Date strings are ISO `YYYY-MM-DD`. We work directly on the strings
 * (or on Dates parsed at UTC midnight) to avoid the off-by-one drift
 * caused by parsing a date-only string with the local timezone.
 *
 * Per project rules: pure functions, deterministic, no side effects.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Parse an ISO `YYYY-MM-DD` string into a UTC midnight Date. */
export function parseIsoDate(iso: string): Date {
  // Append T00:00:00Z so the result is UTC, not local. Critical for
  // diff math because local-zone parsing would shift midnight by the
  // user's offset and produce wrong day counts near month boundaries.
  return new Date(`${iso}T00:00:00Z`);
}

/** Format a UTC Date as ISO `YYYY-MM-DD`. */
export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Days between two ISO date strings. `to` is exclusive (iCal convention). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  return Math.round((to.getTime() - from.getTime()) / ONE_DAY_MS);
}

/** Add `days` (signed) to an ISO date string. */
export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

/** Inclusive lower-bound day index of an event within a window. */
export function eventStartIndex(event: CalendarEvent, windowFromIso: string): number {
  return Math.max(0, daysBetween(windowFromIso, event.starts_on));
}

/** Span (number of cells) of an event clipped to the window. */
export function eventSpan(event: CalendarEvent, windowFromIso: string, windowToIso: string): number {
  const startsClipped = event.starts_on < windowFromIso ? windowFromIso : event.starts_on;
  const endsClipped = event.ends_on > windowToIso ? windowToIso : event.ends_on;
  return Math.max(1, daysBetween(startsClipped, endsClipped));
}

/** Listing → events map, indexed for grid rendering. */
export interface ListingRow {
  listing_id: string;
  listing_name: string;
  property_id: string;
  property_name: string;
  events: CalendarEvent[];
}

/**
 * Group events into one row per listing, then group rows by property.
 *
 * Order matches the backend repository: by property name, then listing
 * name. The backend already orders this way; we re-derive in case the
 * frontend ever fans out to additional sources.
 */
export function groupByListing(events: readonly CalendarEvent[]): ListingRow[] {
  const byListingId = new Map<string, ListingRow>();

  for (const event of events) {
    const existing = byListingId.get(event.listing_id);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    byListingId.set(event.listing_id, {
      listing_id: event.listing_id,
      listing_name: event.listing_name,
      property_id: event.property_id,
      property_name: event.property_name,
      events: [event],
    });
  }

  return Array.from(byListingId.values()).sort((a, b) => {
    if (a.property_name !== b.property_name) {
      return a.property_name.localeCompare(b.property_name);
    }
    return a.listing_name.localeCompare(b.listing_name);
  });
}

/** Group listing-rows by property for the collapsible header rendering. */
export interface PropertyGroup {
  property_id: string;
  property_name: string;
  rows: ListingRow[];
}

export function groupByProperty(rows: readonly ListingRow[]): PropertyGroup[] {
  const groups = new Map<string, PropertyGroup>();
  for (const row of rows) {
    const g = groups.get(row.property_id);
    if (g) {
      g.rows.push(row);
      continue;
    }
    groups.set(row.property_id, {
      property_id: row.property_id,
      property_name: row.property_name,
      rows: [row],
    });
  }
  return Array.from(groups.values());
}

/** Most recent `updated_at` across the events, or null when empty. */
export function lastSyncedAt(events: readonly CalendarEvent[]): string | null {
  if (events.length === 0) return null;
  let max = events[0].updated_at;
  for (const e of events) {
    if (e.updated_at > max) max = e.updated_at;
  }
  return max;
}

/** Format an ISO date as a long month/year label (e.g. "May 2026"). */
export function formatMonthYear(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Format a window as a compact range label (e.g. "May 2 – Aug 1, 2026"). */
export function formatWindowLabel(fromIso: string, toExclusiveIso: string): string {
  const from = parseIsoDate(fromIso);
  const toInclusive = parseIsoDate(addDays(toExclusiveIso, -1));
  const sameYear = from.getUTCFullYear() === toInclusive.getUTCFullYear();
  const fmtFrom: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  const fmtTo: Intl.DateTimeFormatOptions = {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  };
  return `${from.toLocaleString("en-US", fmtFrom)} – ${toInclusive.toLocaleString("en-US", fmtTo)}`;
}

/** ISO date for the first of the given (UTC) year+month. */
export function firstOfMonth(year: number, monthZeroIndexed: number): string {
  const d = new Date(Date.UTC(year, monthZeroIndexed, 1));
  return formatIsoDate(d);
}

/** Number of days in the given (UTC) year+month. */
export function daysInMonth(year: number, monthZeroIndexed: number): number {
  // Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

/** Human-friendly relative time ("2 minutes ago", "3 hours ago"). */
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
