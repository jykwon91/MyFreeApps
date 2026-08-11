import { useMemo, useState } from "react";
import { CALENDAR_WEEKDAY_LABELS } from "@/shared/lib/calendar-constants";
import { buildMonthGrid, eventsOnDay } from "@/app/features/calendar/month-grid-utils";
import CalendarEventDetail from "@/app/features/calendar/CalendarEventDetail";
import CalendarMonthDayDialog from "@/app/features/calendar/CalendarMonthDayDialog";
import CalendarMonthWeekRow from "@/app/features/calendar/CalendarMonthWeekRow";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

export interface CalendarMonthGridProps {
  events: readonly CalendarEvent[];
  /** Any date inside the month to display. */
  anchorIso: string;
  /** Today's date, injected so the component stays deterministic in tests. */
  todayIso: string;
}

/**
 * Month view — the calendar shape people already know.
 *
 * Seven columns, Sunday through Saturday, six week rows. Bookings and
 * tenancies draw as pills that span the days they cover, so "the house is
 * occupied from the 3rd to the 20th" is one bar rather than eighteen badges.
 *
 * This is the default view. The listing-per-row timeline still exists behind
 * the view toggle for the question this shape can't answer — which *room* is
 * free — since a month cell stacks every listing together.
 */
export default function CalendarMonthGrid({
  events,
  anchorIso,
  todayIso,
}: CalendarMonthGridProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [expandedDayIso, setExpandedDayIso] = useState<string | null>(null);

  const grid = useMemo(
    () => buildMonthGrid(anchorIso, events, todayIso),
    [anchorIso, events, todayIso],
  );
  const expandedDayEvents = useMemo(
    () => (expandedDayIso ? eventsOnDay(events, expandedDayIso) : []),
    [events, expandedDayIso],
  );

  function handleDayDialogEventClick(event: CalendarEvent) {
    // Swap one dialog for the other rather than stacking them.
    setExpandedDayIso(null);
    setSelectedEvent(event);
  }

  return (
    <>
      <div
        className="overflow-hidden rounded-lg border bg-card"
        data-testid="calendar-month-grid"
        data-month={grid.monthLabel}
      >
        <div className="grid grid-cols-7 bg-muted/30" data-testid="calendar-month-weekday-header">
          {CALENDAR_WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-r px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
            >
              {label}
            </div>
          ))}
        </div>

        {grid.weeks.map((week) => (
          <CalendarMonthWeekRow
            key={week.startIso}
            week={week}
            onEventClick={setSelectedEvent}
            onOverflowClick={setExpandedDayIso}
          />
        ))}
      </div>

      <CalendarMonthDayDialog
        dayIso={expandedDayIso}
        events={expandedDayEvents}
        onClose={() => setExpandedDayIso(null)}
        onEventClick={handleDayDialogEventClick}
      />
      <CalendarEventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </>
  );
}
