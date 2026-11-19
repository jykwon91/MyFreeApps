import type { CALENDAR_VIEW_MODE } from "@mybookkeeper/api-client/constants/calendarViewMode";

/**
 * Which shape the calendar is drawn in.
 *
 * `month` is the familiar seven-column grid and answers "what's happening
 * this month". `timeline` is one row per listing and answers "which room is
 * free" — a question the month shape can't, since a cell stacks every listing
 * together.
 */
export type CalendarView = (typeof CALENDAR_VIEW_MODE)[keyof typeof CALENDAR_VIEW_MODE];
