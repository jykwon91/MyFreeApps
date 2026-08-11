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
 *
 * The listing and property fields are nullable, and only a `lease` event can
 * carry nulls: a blackout hangs off a listing by construction, whereas a
 * signed lease may not have been linked to one yet. Render those under an
 * "unassigned" heading — see `CALENDAR_UNASSIGNED_*` in
 * `shared/lib/calendar-constants`.
 */
export interface CalendarEvent {
  id: string;
  listing_id: string | null;
  listing_name: string | null;
  property_id: string | null;
  property_name: string | null;
  starts_on: string;
  ends_on: string;
  source: string;
  source_event_id: string | null;
  summary: string | null;
  host_notes: string | null;
  attachment_count: number;
  updated_at: string;
}
