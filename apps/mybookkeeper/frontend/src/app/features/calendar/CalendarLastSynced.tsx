import { lastSyncedAt, relativeTime } from "@/app/features/calendar/calendar-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

export interface CalendarLastSyncedProps {
  events: readonly CalendarEvent[];
}

/**
 * Small "last synced" indicator. Pulls the most recent `updated_at`
 * across the loaded events — gives the user a sense of how fresh the
 * data is without exposing the iCal poller's internal schedule.
 *
 * When there are no events, shows "—" so the indicator never lies
 * about staleness ("just now" with zero rows would be misleading).
 */
export default function CalendarLastSynced({ events }: CalendarLastSyncedProps) {
  const latest = lastSyncedAt(events);
  return (
    <div
      className="text-xs text-muted-foreground"
      data-testid="calendar-last-synced"
      title={latest ?? undefined}
    >
      Last synced: <span className="font-medium">{latest ? relativeTime(latest) : "—"}</span>
    </div>
  );
}
