import Skeleton from "@/shared/components/ui/Skeleton";
import {
  CALENDAR_MONTH_DAY_HEADER_PX,
  CALENDAR_MONTH_LANE_GAP_PX,
  CALENDAR_MONTH_LANE_HEIGHT_PX,
  CALENDAR_MONTH_MIN_ROW_PX,
  CALENDAR_MONTH_WEEKS,
  CALENDAR_WEEKDAY_LABELS,
} from "@/shared/lib/calendar-constants";

/** Which columns get a placeholder pill, per week row — enough to read as a
 *  month without pretending to know the data. */
const PLACEHOLDER_PILLS: ReadonlyArray<ReadonlyArray<{ startCol: number; span: number }>> = [
  [{ startCol: 1, span: 3 }],
  [{ startCol: 0, span: 5 }, { startCol: 5, span: 2 }],
  [{ startCol: 2, span: 4 }],
  [{ startCol: 0, span: 2 }, { startCol: 3, span: 3 }],
  [{ startCol: 4, span: 3 }],
  [{ startCol: 1, span: 2 }],
];

/**
 * Skeleton for the month view.
 *
 * Mirrors the loaded layout exactly — same weekday header, same six rows of
 * seven cells, same day-number and pill geometry — so nothing shifts when the
 * data lands.
 */
export default function CalendarMonthSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border bg-card"
      data-testid="calendar-month-skeleton"
      aria-label="Loading calendar"
    >
      <div className="grid grid-cols-7 bg-muted/30">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <div key={label} className="border-r px-2 py-1.5 last:border-r-0">
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>

      {Array.from({ length: CALENDAR_MONTH_WEEKS }, (_, week) => (
        <div
          key={`w-${week}`}
          className="relative"
          style={{ minHeight: CALENDAR_MONTH_MIN_ROW_PX }}
        >
          <div className="grid h-full grid-cols-7">
            {CALENDAR_WEEKDAY_LABELS.map((label) => (
              <div key={`w-${week}-${label}`} className="border-r border-t last:border-r-0">
                <div
                  className="flex items-start justify-end px-1.5 pt-1"
                  style={{ height: CALENDAR_MONTH_DAY_HEADER_PX }}
                >
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute inset-0">
            {PLACEHOLDER_PILLS[week].map(({ startCol, span }, lane) => (
              <div
                key={`w-${week}-p-${startCol}`}
                className="absolute"
                style={{
                  left: `calc(${(startCol / 7) * 100}% + 2px)`,
                  width: `calc(${(span / 7) * 100}% - 4px)`,
                  top:
                    CALENDAR_MONTH_DAY_HEADER_PX +
                    lane * (CALENDAR_MONTH_LANE_HEIGHT_PX + CALENDAR_MONTH_LANE_GAP_PX),
                  height: CALENDAR_MONTH_LANE_HEIGHT_PX,
                }}
              >
                <Skeleton className="h-full w-full rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
