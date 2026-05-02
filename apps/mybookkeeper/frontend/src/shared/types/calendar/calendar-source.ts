/**
 * Known event source slugs.
 *
 * `manual` is operator-entered; the others come from iCal-poll imports
 * (channel slugs). Furnished Finder doesn't expose iCal — its blackouts
 * never appear in this list, by design. The frontend treats unknown
 * sources gracefully (gray fallback color) so the calendar never
 * crashes if a new channel is added before the frontend is updated.
 */
export const CALENDAR_SOURCES = [
  "airbnb",
  "vrbo",
  "furnished_finder",
  "rotating_room",
  "direct",
  "manual",
] as const;

export type CalendarSource = (typeof CALENDAR_SOURCES)[number];
