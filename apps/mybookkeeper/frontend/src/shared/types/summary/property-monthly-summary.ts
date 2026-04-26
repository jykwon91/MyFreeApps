import type { MonthSummary } from "./month-summary";

export interface PropertyMonthlySummary {
  property_id: string;
  name: string;
  months: MonthSummary[];
}
