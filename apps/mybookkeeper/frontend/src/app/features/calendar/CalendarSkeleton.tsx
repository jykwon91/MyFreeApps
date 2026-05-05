import Skeleton from "@/shared/components/ui/Skeleton";
import {
  CALENDAR_DAY_CELL_PX,
  CALENDAR_LABEL_COLUMN_PX,
  CALENDAR_ROW_HEIGHT_PX,
} from "@/shared/lib/calendar-constants";

export interface CalendarSkeletonProps {
  rows?: number;
  days?: number;
}

/**
 * Skeleton for the unified calendar grid. Mirrors the loaded layout —
 * one header row + N listing rows, each with a label cell + day cells.
 *
 * Per project rule: skeletons mirror loaded layout exactly to prevent
 * layout shift.
 */
export default function CalendarSkeleton({ rows = 4, days = 30 }: CalendarSkeletonProps) {
  return (
    <div data-testid="calendar-skeleton">
      {/* Mobile: agenda list skeleton */}
      <ul className="md:hidden space-y-3" aria-label="Loading agenda">
        {Array.from({ length: rows }, (_, i) => (
          <li key={`m-${i}`} className="border rounded-lg p-3 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>

      {/* Desktop: grid skeleton */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        {/* Header row */}
        <div
          className="bg-muted/50 flex"
          style={{ height: CALENDAR_ROW_HEIGHT_PX }}
        >
          <div
            className="px-3 py-2 border-r"
            style={{ width: CALENDAR_LABEL_COLUMN_PX }}
          >
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex">
            {Array.from({ length: days }, (_, i) => (
              <div
                key={`h-${i}`}
                className="flex items-center justify-center border-r"
                style={{ width: CALENDAR_DAY_CELL_PX }}
              >
                <Skeleton className="h-3 w-6" />
              </div>
            ))}
          </div>
        </div>
        {/* Listing rows */}
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={`r-${r}`}
            className="flex border-t"
            style={{ height: CALENDAR_ROW_HEIGHT_PX }}
          >
            <div
              className="px-3 py-2 border-r"
              style={{ width: CALENDAR_LABEL_COLUMN_PX }}
            >
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex flex-1 relative">
              {Array.from({ length: days }, (_, c) => (
                <div
                  key={`r-${r}-c-${c}`}
                  className="border-r"
                  style={{ width: CALENDAR_DAY_CELL_PX }}
                />
              ))}
              {/* A couple of skeleton event bars per row at varying offsets.
                  Skeleton accepts only className, so we wrap it with positioning. */}
              <div
                className="absolute top-2 bottom-2"
                style={{
                  left: 4 * CALENDAR_DAY_CELL_PX,
                  width: 5 * CALENDAR_DAY_CELL_PX,
                }}
              >
                <Skeleton className="h-full w-full rounded" />
              </div>
              <div
                className="absolute top-2 bottom-2"
                style={{
                  left: 14 * CALENDAR_DAY_CELL_PX,
                  width: 3 * CALENDAR_DAY_CELL_PX,
                }}
              >
                <Skeleton className="h-full w-full rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
