import type { MonthlyAverage } from "@mybookkeeper/api-client/types/summary/MonthlyAverage";

export interface MonthlyAverageCardProps {
  average: MonthlyAverage;
  /** The earlier stretch's averages, or null when not comparing. */
  previous: MonthlyAverage | null;
  againstLabel: string;
}
