import { useState } from "react";
import {
  getSourceColor,
  getSourceLabel,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import CalendarEventDetail from "@/app/features/calendar/CalendarEventDetail";

interface Props {
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
export default function CalendarAgendaList({ events }: Props) {
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
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="flex items-start gap-2 w-full text-left p-2 -m-2 rounded-md hover:bg-muted transition-colors min-h-[44px]"
                    data-testid="calendar-agenda-event"
                    aria-label={`${event.listing_name}, ${getSourceLabel(event.source)} booking. Click for details.`}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-sm mt-1 shrink-0"
                      style={{ backgroundColor: getSourceColor(event.source) }}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {event.listing_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {event.property_name} · {getSourceLabel(event.source)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {event.starts_on} → {event.ends_on}
                      </div>
                    </div>
                  </button>
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
