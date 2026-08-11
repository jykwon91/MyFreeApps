import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { getSourceColor, getSourceLabel, isReadOnlySource } from "@/shared/lib/calendar-constants";
import { formatDayLabel } from "@/app/features/calendar/calendar-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

export interface CalendarMonthDayDialogProps {
  /** ISO date whose events to list, or null when closed. */
  dayIso: string | null;
  events: readonly CalendarEvent[];
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
}

/**
 * Every booking on one day.
 *
 * A month cell only has room for a few lanes, and a busy day overflows. The
 * overflow must stay reachable — a booking the host can't see is a booking
 * they'll double-book — so "+N more" opens this list, which shows all of the
 * day's events, not just the hidden ones.
 */
export default function CalendarMonthDayDialog({
  dayIso,
  events,
  onClose,
  onEventClick,
}: CalendarMonthDayDialogProps) {
  return (
    <Dialog.Root open={dayIso !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <Dialog.Content
          data-testid="calendar-month-day-dialog"
          className="fixed left-1/2 top-1/2 z-[70] max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg"
        >
          <Dialog.Title className="text-lg font-semibold">
            {dayIso ? formatDayLabel(dayIso) : ""}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {events.length === 1 ? "1 booking" : `${events.length} bookings`}
          </Dialog.Description>

          <ul className="mt-4 space-y-1">
            {events.map((event) => {
              const label = isReadOnlySource(event.source)
                ? (event.summary ?? getSourceLabel(event.source))
                : getSourceLabel(event.source);
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onEventClick(event)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="calendar-month-day-dialog-event"
                    data-event-id={event.id}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: getSourceColor(event.source) }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{label}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {event.starts_on} → {event.ends_on}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Dialog.Close
            className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-1 transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
