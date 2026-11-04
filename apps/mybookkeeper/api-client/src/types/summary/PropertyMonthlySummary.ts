import type { MonthSummary } from "./MonthSummary";

export interface PropertyMonthlySummary {
  property_id: string;
  name: string;
  months: MonthSummary[];
}
