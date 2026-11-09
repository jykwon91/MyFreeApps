import { CALENDAR_SOURCES, type CalendarSource } from "../types/calendar/calendar-source";

/**
 * Sources offered in the calendar's source filter. Includes every known
 * source even if no events match it today — the filter is a planning
 * tool, not a result filter, and stays stable across windows.
 */
export const CALENDAR_FILTER_SOURCES: readonly CalendarSource[] = CALENDAR_SOURCES;
