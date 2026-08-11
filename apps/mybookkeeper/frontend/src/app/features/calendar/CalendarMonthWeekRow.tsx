import {
  CALENDAR_MONTH_DAY_HEADER_PX,
  CALENDAR_MONTH_LANE_GAP_PX,
  CALENDAR_MONTH_LANE_HEIGHT_PX,
  CALENDAR_MONTH_MIN_ROW_PX,
} from "@/shared/lib/calendar-constants";
import CalendarMonthDayCell from "@/app/features/calendar/CalendarMonthDayCell";
import CalendarMonthEventPill from "@/app/features/calendar/CalendarMonthEventPill";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { MonthGridWeek } from "@/shared/types/calendar/month-grid-week";

export interface CalendarMonthWeekRowProps {
  week: MonthGridWeek;
  onEventClick: (event: CalendarEvent) => void;
  onOverflowClick: (dayIso: string) => void;
}

/**
 * One Sunday-to-Saturday row.
 *
 * Two stacked layers: a 7-column grid of day cells for the chrome, and an
 * absolutely-positioned layer of pills above it. Splitting them is what lets
 * a single stay stretch across day boundaries instead of being chopped into
 * one badge per cell.
 *
 * The row itself is the grid rather than wrapping one: a nested `h-full` grid
 * resolves against an auto height and collapses to its content, which would
 * strand each cell's "+N more" button up under the first lane of pills instead
 * of at the bottom of the cell.
 */
export default function CalendarMonthWeekRow({
  week,
  onEventClick,
  onOverflowClick,
}: CalendarMonthWeekRowProps) {
  const lanesHeight =
    week.laneCount * (CALENDAR_MONTH_LANE_HEIGHT_PX + CALENDAR_MONTH_LANE_GAP_PX);

  return (
    <div
      className="relative grid grid-cols-7"
      style={{
        minHeight: Math.max(
          CALENDAR_MONTH_MIN_ROW_PX,
          CALENDAR_MONTH_DAY_HEADER_PX + lanesHeight + CALENDAR_MONTH_LANE_HEIGHT_PX,
        ),
      }}
      data-testid="calendar-month-week"
      data-week-start={week.startIso}
    >
      {week.days.map((day) => (
        <CalendarMonthDayCell
          key={day.iso}
          day={day}
          overflowCount={week.overflowByDay[day.iso] ?? 0}
          onOverflowClick={onOverflowClick}
        />
      ))}

      {/* Pills float above the cells; the wrapper must not eat cell clicks. */}
      <div className="pointer-events-none absolute inset-0">
        {week.segments.map((segment) => (
          <span
            key={`${segment.event.id}-${week.startIso}`}
            className="pointer-events-auto"
          >
            <CalendarMonthEventPill segment={segment} onClick={onEventClick} />
          </span>
        ))}
      </div>
    </div>
  );
}
