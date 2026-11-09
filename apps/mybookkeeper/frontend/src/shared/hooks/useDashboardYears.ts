import { useMemo } from "react";
import { dashboardYears } from "@mybookkeeper/api-client/utils/dashboardYears";

/** The years for the dashboard year dropdown; see `dashboardYears`. */
export function useDashboardYears(dataYears: number[] | undefined): number[] {
  return useMemo(() => dashboardYears(dataYears, new Date().getFullYear()), [dataYears]);
}
