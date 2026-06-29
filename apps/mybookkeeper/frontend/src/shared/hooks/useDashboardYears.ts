import { useMemo } from "react";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Builds the descending list of years for the dashboard year dropdown.
 *
 * Takes the set of years that have transaction data (fetched unfiltered via
 * GET /summary/years), so the list is stable regardless of the active year or
 * property filter — selecting a year must never remove the other years from
 * the dropdown. Deriving the list from the year-scoped summary instead caused
 * a feedback loop where picking a year collapsed the dropdown to just that
 * year. The current year is always included so the user can always filter to
 * "this year" even before any data exists for it.
 */
export function useDashboardYears(dataYears: number[] | undefined): number[] {
  return useMemo(() => {
    const yearSet = new Set<number>([CURRENT_YEAR]);

    for (const year of dataYears ?? []) {
      if (Number.isInteger(year) && year > 1900) {
        yearSet.add(year);
      }
    }

    return Array.from(yearSet).sort((a, b) => b - a);
  }, [dataYears]);
}
