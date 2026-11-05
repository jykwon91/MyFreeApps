/** What each source is called on screen. */
const CALENDAR_SOURCE_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  furnished_finder: "Furnished Finder",
  rotating_room: "Rotating Room",
  direct: "Direct",
  manual: "Manual",
  lease: "Tenant",
};

export function getSourceLabel(source: string): string {
  return CALENDAR_SOURCE_LABELS[source] ?? source;
}

/**
 * Sources whose events cannot be edited in the detail dialog.
 *
 * A `lease` event's `id` is a lease id, not a blackout id — the notes and
 * attachment endpoints are keyed by blackout and would 404. The dialog hides
 * both sections for these sources and points the host at the lease instead.
 */
const CALENDAR_READ_ONLY_SOURCES: readonly string[] = ["lease"];

export function isReadOnlySource(source: string): boolean {
  return CALENDAR_READ_ONLY_SOURCES.includes(source);
}

/**
 * A lease the host hasn't linked to a listing yet.
 *
 * `signed_leases.listing_id` is nullable, so a tenancy can exist before it is
 * attached to a listing. The calendar shows it regardless — a real tenant in
 * a real room is not less real for a missing foreign key — under this
 * heading, which doubles as a nudge to go set the link.
 */
export const CALENDAR_UNASSIGNED_LISTING_LABEL = "No listing linked";
