import { CALENDAR_MONTH_DAY_HEADER_PX } from "@/shared/lib/calendar-constants";
import type { MonthGridDay } from "@/shared/types/calendar/month-grid-day";

export interface CalendarMonthDayCellProps {
  day: MonthGridDay;
  /** Events on this day that didn't fit the lane budget. */
  overflowCount: number;
  onOverflowClick: (dayIso: string) => void;
}

/**
 * Background cell for one day: the day number, and a "+N more" button when
 * the week ran out of lanes.
 *
 * The pills themselves are drawn in a layer above the cells so a stay can
 * span columns — this component owns only what belongs to a single day.
 */
export default function CalendarMonthDayCell({
  day,
  overflowCount,
  onOverflowClick,
}: CalendarMonthDayCellProps) {
  const numberClass = [
    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs",
    day.isToday ? "bg-primary font-semibold text-primary-foreground" : "",
    !day.isToday && day.isInAnchorMonth ? "text-foreground" : "",
    !day.isToday && !day.isInAnchorMonth ? "text-muted-foreground/60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`relative flex flex-col border-r border-t last:border-r-0 ${
        day.isInAnchorMonth ? "" : "bg-muted/20"
      }`}
      data-testid="calendar-month-day"
      data-day={day.iso}
      data-outside-month={day.isInAnchorMonth ? undefined : "true"}
      data-today={day.isToday ? "true" : undefined}
    >
      <div
        className="flex items-start justify-end px-1.5 pt-1"
        style={{ height: CALENDAR_MONTH_DAY_HEADER_PX }}
      >
        <span className={numberClass}>{day.dayOfMonth}</span>
      </div>

      {overflowCount > 0 ? (
        <button
          type="button"
          onClick={() => onOverflowClick(day.iso)}
          className="mt-auto mb-1 mx-1 rounded px-1 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label={`Show all bookings on ${day.iso}`}
          data-testid="calendar-month-overflow"
        >
          +{overflowCount} more
        </button>
      ) : null}
    </div>
  );
}
