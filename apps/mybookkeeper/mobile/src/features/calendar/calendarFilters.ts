import { getSourceLabel } from "@mybookkeeper/api-client/constants/calendarSources";
import { FILTER_MESSAGES } from "../../constants/calendarFilters";
import type { CalendarFilters } from "../../types/CalendarFilters";

export const NO_CALENDAR_FILTERS: CalendarFilters = { propertyIds: [], sources: [] };

export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((existing) => existing !== value) : [...values, value];
}

export function hasCalendarFilters(filters: CalendarFilters): boolean {
  return filters.propertyIds.length > 0 || filters.sources.length > 0;
}

/** A property that's gone can't stay chosen: it would filter on something nobody can see or clear. */
export function withKnownProperties(filters: CalendarFilters, knownPropertyIds: readonly string[]): CalendarFilters {
  const propertyIds = filters.propertyIds.filter((id) => knownPropertyIds.includes(id));
  return propertyIds.length === filters.propertyIds.length ? filters : { ...filters, propertyIds };
}

export function filterSummary(filters: CalendarFilters, properties: readonly { id: string; name: string }[]): string {
  const parts: string[] = [];
  if (filters.propertyIds.length === 1) {
    parts.push(properties.find((property) => property.id === filters.propertyIds[0])?.name ?? FILTER_MESSAGES.properties);
  } else if (filters.propertyIds.length > 1) {
    parts.push(`${filters.propertyIds.length} properties`);
  }
  if (filters.sources.length === 1) parts.push(getSourceLabel(filters.sources[0]));
  else if (filters.sources.length > 1) parts.push(`${filters.sources.length} sources`);
  return parts.length > 0 ? parts.join(", ") : FILTER_MESSAGES.button;
}
