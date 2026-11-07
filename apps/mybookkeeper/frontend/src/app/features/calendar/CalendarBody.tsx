import { Link } from "react-router-dom";
import EmptyState from "@/shared/components/ui/EmptyState";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import CalendarLoadingState from "./CalendarLoadingState";
import CalendarViewport from "./CalendarViewport";
import CalendarAgendaList from "./CalendarAgendaList";

export interface CalendarBodyProps {
  mode: ListLoadMode;
  hasNoListings: boolean;
  view: CalendarView;
  events: readonly CalendarEvent[];
  fromIso: string;
  toIso: string;
  anchorIso: string;
  todayIso: string;
}

export default function CalendarBody({
  mode,
  hasNoListings,
  view,
  events,
  fromIso,
  toIso,
  anchorIso,
  todayIso,
}: CalendarBodyProps) {
  switch (mode) {
    case "error":
      // The page's LoadErrorAlert says the calendar couldn't load. An empty
      // grid here would read as "no bookings".
      return null;
    case "loading":
      return <CalendarLoadingState view={view} />;
    case "empty":
      // A tenancy can exist with no listing behind it, so "no listings" is
      // only the right story when there's also nothing to show. Otherwise
      // this prompt would hide the very events it claims don't exist.
      if (hasNoListings) {
        return (
          <div
            className="text-center text-muted-foreground text-sm py-8"
            data-testid="calendar-no-listings"
          >
            <p>You don't have any listings yet.</p>
            <Link
              to="/listings"
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              Add a listing to start tracking bookings here
            </Link>
          </div>
        );
      }
      return (
        <EmptyState message="No bookings in this window. Try a different date range, or check that channel sync is wired up under Listings → Channels." />
      );
    case "list":
      return (
        <>
          <div className="hidden md:block" data-testid="calendar-desktop">
            <CalendarViewport
              view={view}
              events={events}
              fromIso={fromIso}
              toIso={toIso}
              anchorIso={anchorIso}
              todayIso={todayIso}
            />
          </div>
          <div className="md:hidden" data-testid="calendar-mobile">
            <CalendarAgendaList events={events} />
          </div>
        </>
      );
  }
}
