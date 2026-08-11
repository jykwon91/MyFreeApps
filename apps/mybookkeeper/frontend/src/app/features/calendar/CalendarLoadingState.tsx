import CalendarAgendaSkeleton from "@/app/features/calendar/CalendarAgendaSkeleton";
import CalendarMonthSkeleton from "@/app/features/calendar/CalendarMonthSkeleton";
import CalendarSkeleton from "@/app/features/calendar/CalendarSkeleton";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";

export interface CalendarLoadingStateProps {
  view: CalendarView;
}

/**
 * The right placeholder for whichever shape is about to render.
 *
 * Picking the skeleton is a per-view decision, but the page's render is
 * already a chain of states; keeping the branch here keeps that chain
 * readable and guarantees the mobile agenda placeholder is identical in
 * both views.
 */
export default function CalendarLoadingState({ view }: CalendarLoadingStateProps) {
  if (view === "timeline") return <CalendarSkeleton />;

  return (
    <div data-testid="calendar-skeleton">
      <div className="md:hidden">
        <CalendarAgendaSkeleton />
      </div>
      <div className="hidden md:block">
        <CalendarMonthSkeleton />
      </div>
    </div>
  );
}
