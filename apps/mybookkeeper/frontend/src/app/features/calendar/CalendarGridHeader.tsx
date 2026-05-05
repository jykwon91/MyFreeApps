import {
  CALENDAR_DAY_CELL_PX,
  CALENDAR_LABEL_COLUMN_PX,
  CALENDAR_ROW_HEIGHT_PX,
} from "@/shared/lib/calendar-constants";
import { addDays, parseIsoDate } from "@/app/features/calendar/calendar-utils";

export interface CalendarGridHeaderProps {
  fromIso: string;
  totalDays: number;
}

const WEEKEND_DAYS = new Set([0, 6]); // Sun, Sat
const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The X-axis. Renders one cell per day in the visible window.
 *
 * Each cell shows the day-of-month number; we add a month label above
 * the first day of each month to anchor the view without a separate
 * row.
 */
export default function CalendarGridHeader({ fromIso, totalDays }: CalendarGridHeaderProps) {
  return (
    <div
      className="flex bg-muted/50 border-b sticky top-0 z-10"
      style={{ height: CALENDAR_ROW_HEIGHT_PX }}
      data-testid="calendar-grid-header"
    >
      <div
        className="border-r flex items-center px-3 text-xs font-medium text-muted-foreground bg-muted/50"
        style={{ width: CALENDAR_LABEL_COLUMN_PX }}
      >
        Listing / Property
      </div>
      <div className="flex">
        {Array.from({ length: totalDays }, (_, i) => {
          const iso = addDays(fromIso, i);
          const date = parseIsoDate(iso);
          const dayOfMonth = date.getUTCDate();
          const dayOfWeek = date.getUTCDay();
          const isWeekend = WEEKEND_DAYS.has(dayOfWeek);
          const isFirstOfMonth = dayOfMonth === 1;
          return (
            <div
              key={iso}
              className={`flex flex-col items-center justify-center border-r text-xs ${
                isWeekend ? "bg-muted/30" : ""
              }`}
              style={{ width: CALENDAR_DAY_CELL_PX }}
            >
              {isFirstOfMonth ? (
                <span className="text-[10px] font-semibold text-primary leading-none">
                  {SHORT_MONTH_NAMES[date.getUTCMonth()]}
                </span>
              ) : null}
              <span className="text-foreground leading-tight">{dayOfMonth}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
