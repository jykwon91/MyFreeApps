import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";

export interface CalendarSection {
  key: string;
  title: string;
  spokenTitle: string;
  /** The check-in date of everything in it. Null for stays that began before this month. */
  date: string | null;
  data: CalendarEvent[];
}
