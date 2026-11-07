/**
 * Query arguments for `useGetCalendarEventsQuery`.
 *
 * `from` (inclusive) and `to` (exclusive) are ISO `YYYY-MM-DD` and required:
 * the server doesn't pick a window from its own clock. Filter arrays are converted to
 * comma-separated CSVs by the RTK Query layer before serialisation.
 */
export interface CalendarEventsArgs {
  from: string;
  to: string;
  listing_ids?: readonly string[];
  property_ids?: readonly string[];
  sources?: readonly string[];
}
