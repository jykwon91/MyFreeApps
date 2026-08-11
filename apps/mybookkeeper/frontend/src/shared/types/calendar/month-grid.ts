import type { MonthGridWeek } from "@/shared/types/calendar/month-grid-week";

/** A full month view: the anchor month padded out to whole weeks. */
export interface MonthGrid {
  /** ISO date of the first cell (the Sunday on or before the 1st). */
  gridStartIso: string;
  /** ISO date one day past the last cell — exclusive, iCal convention. */
  gridEndIso: string;
  /** e.g. "September 2026". */
  monthLabel: string;
  weeks: MonthGridWeek[];
}
