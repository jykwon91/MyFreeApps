import { format, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Formats the desired-stay range for inbox/detail cards.
 *
 * Returns one of:
 *   - "Open-ended"             when both dates are null
 *   - "From Jun 1"             when only start is set
 *   - "Until Aug 31"           when only end is set
 *   - "Jun 1 → Aug 31"         when both are set
 *
 * Date strings are ISO date (YYYY-MM-DD) per the backend ``Date`` schema.
 */
export function formatDesiredDates(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return "Open-ended";
  if (start && !end) return `From ${formatShortDate(start)}`;
  if (!start && end) return `Until ${formatShortDate(end)}`;
  return `${formatShortDate(start as string)} → ${formatShortDate(end as string)}`;
}

/** "Jun 1" — month abbreviation + day number, no year. */
export function formatShortDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d");
}

/** Long format for detail pages: "June 1, 2026". */
export function formatLongDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

/** Relative time for the inbox: "2 hours ago", "3 days ago". */
export function formatRelativeTime(isoTimestamp: string): string {
  return formatDistanceToNow(parseISO(isoTimestamp), { addSuffix: true });
}

/** Absolute timestamp for tooltips: "Apr 26, 2026 14:32". */
export function formatAbsoluteTime(isoTimestamp: string): string {
  return format(parseISO(isoTimestamp), "MMM d, yyyy HH:mm");
}
