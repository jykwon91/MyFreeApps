/**
 * Known event source slugs.
 *
 * `manual` is operator-entered; most others come from iCal-poll imports
 * (channel slugs). Furnished Finder doesn't expose iCal — its blackouts
 * never appear in this list, by design. The frontend treats unknown
 * sources gracefully (gray fallback color) so the calendar never
 * crashes if a new channel is added before the frontend is updated.
 *
 * `lease` is the odd one out: not a channel, but tenant occupancy unioned
 * in from `signed_leases`. Events carrying it are read-only — their `id` is
 * a lease id, so the blackout notes/attachment endpoints don't apply. See
 * `CALENDAR_READ_ONLY_SOURCES` in `shared/lib/calendar-constants`.
 */
export const CALENDAR_SOURCES = [
  "airbnb",
  "vrbo",
  "furnished_finder",
  "rotating_room",
  "direct",
  "manual",
  "lease",
] as const;

export type CalendarSource = (typeof CALENDAR_SOURCES)[number];
