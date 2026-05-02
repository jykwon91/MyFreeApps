/**
 * Query arguments for `useGetCalendarEventsQuery`.
 *
 * `from` and `to` are ISO `YYYY-MM-DD`. Filter arrays are converted to
 * comma-separated CSVs by the RTK Query layer before serialisation.
 */
export interface CalendarEventsArgs {
  from?: string;
  to?: string;
  listing_ids?: readonly string[];
  property_ids?: readonly string[];
  sources?: readonly string[];
}
