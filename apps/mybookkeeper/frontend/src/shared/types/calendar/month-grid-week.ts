import type { MonthEventSegment } from "@/shared/types/calendar/month-event-segment";
import type { MonthGridDay } from "@/shared/types/calendar/month-grid-day";

/** One Sunday-to-Saturday row of the month grid. */
export interface MonthGridWeek {
  /** ISO date of this row's Sunday — stable React key. */
  startIso: string;
  /** Exactly 7 days. */
  days: MonthGridDay[];
  /** Segments that fit within the visible lane budget. */
  segments: MonthEventSegment[];
  /**
   * Per-day count of events pushed past the lane budget, keyed by ISO date.
   * Days with nothing hidden are absent rather than zero.
   */
  overflowByDay: Record<string, number>;
  /** Lanes actually drawn — drives the row's height. */
  laneCount: number;
}
