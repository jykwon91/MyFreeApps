import { useMemo } from "react";
import type { SummaryResponse } from "@/shared/types/summary/summary";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Derives the set of years to show in the year dropdown from the summary's
 * by_month entries (format "YYYY-MM"). Always includes the current year even
 * when no transactions exist yet.
 */
export function useDashboardYears(
  summary: SummaryResponse | undefined,
): number[] {
  return useMemo(() => {
    const yearSet = new Set<number>([CURRENT_YEAR]);

    if (summary?.by_month) {
      for (const entry of summary.by_month) {
        const yearStr = entry.month.slice(0, 4);
        const year = Number(yearStr);
        if (Number.isInteger(year) && year > 1900) {
          yearSet.add(year);
        }
      }
    }

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [summary]);
}
