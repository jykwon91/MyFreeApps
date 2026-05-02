/**
 * One row in the unified calendar viewer's response.
 *
 * Mirrors `app/schemas/calendar/calendar_event_response.py` on the backend.
 * Date strings are ISO `YYYY-MM-DD` (not `Date` instances) — the grid
 * renders directly from the string without timezone conversion to avoid
 * the off-by-one drift that would happen if we parsed as local-midnight
 * UTC and re-rendered.
 *
 * `ends_on` is EXCLUSIVE per iCal RFC 5545 — a single blocked day has
 * `ends_on = starts_on + 1`.
 */
export interface CalendarEvent {
  id: string;
  listing_id: string;
  listing_name: string;
  property_id: string;
  property_name: string;
  starts_on: string;
  ends_on: string;
  source: string;
  source_event_id: string | null;
  summary: string | null;
  updated_at: string;
}
