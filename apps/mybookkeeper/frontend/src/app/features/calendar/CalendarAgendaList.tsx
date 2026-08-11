import { useState } from "react";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import CalendarEventDetail from "@/app/features/calendar/CalendarEventDetail";
import CalendarAgendaEvent from "@/app/features/calendar/CalendarAgendaEvent";

export interface CalendarAgendaListProps {
  events: readonly CalendarEvent[];
}

/**
 * Mobile (<768px) view of the unified calendar — a vertical agenda
 * list grouped by date.
 *
 * Optimised for narrow screens where a side-scrolling grid is
 * unusable. Events are sorted by start date; events spanning multiple
 * days appear once at their start date with the date range visible.
 */
export default function CalendarAgendaList({ events }: CalendarAgendaListProps) {
  // Sort by start date, then end date (longer first for ties).
  const sorted = [...events].sort((a, b) => {
    if (a.starts_on !== b.starts_on) return a.starts_on.localeCompare(b.starts_on);
    return b.ends_on.localeCompare(a.ends_on);
  });

  // Group by start date.
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of sorted) {
    const existing = groups.get(event.starts_on);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(event.starts_on, [event]);
    }
  }

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  return (
    <>
      <ul className="space-y-3" data-testid="calendar-agenda-list">
        {Array.from(groups.entries()).map(([dateIso, dayEvents]) => (
          <li
            key={dateIso}
            className="border rounded-lg p-3 space-y-2"
            data-testid="calendar-agenda-day"
          >
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {dateIso}
            </div>
            <ul className="space-y-2">
              {dayEvents.map((event) => (
                <li key={event.id} data-source={event.source}>
                  <CalendarAgendaEvent event={event} onSelect={setSelectedEvent} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <CalendarEventDetail
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  );
}
