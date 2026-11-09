/** An empty list means no filter: every property, every source. */
export interface CalendarFilters {
  propertyIds: readonly string[];
  sources: readonly string[];
}
