import CalendarGrid from "@/app/features/calendar/CalendarGrid";
import CalendarMonthGrid from "@/app/features/calendar/CalendarMonthGrid";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";

export interface CalendarViewportProps {
  view: CalendarView;
  events: readonly CalendarEvent[];
  /** Fetched window — the timeline draws exactly this range. */
  fromIso: string;
  toIso: string;
  /** Any date inside the month the month view should show. */
  anchorIso: string;
  todayIso: string;
}

/** The desktop calendar body: whichever shape the current view asks for. */
export default function CalendarViewport({
  view,
  events,
  fromIso,
  toIso,
  anchorIso,
  todayIso,
}: CalendarViewportProps) {
  if (view === "timeline") {
    return <CalendarGrid events={events} fromIso={fromIso} toIso={toIso} />;
  }

  return <CalendarMonthGrid events={events} anchorIso={anchorIso} todayIso={todayIso} />;
}
