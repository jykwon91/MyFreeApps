import type { MonthSummary } from "./MonthSummary";
import type { MonthExpenseSummary } from "./MonthExpenseSummary";
import type { MonthRevenueSummary } from "./MonthRevenueSummary";
import type { PropertySummary } from "./PropertySummary";
import type { PropertyMonthlySummary } from "./PropertyMonthlySummary";

export interface SummaryResponse {
  revenue: number;
  expenses: number;
  profit: number;
  by_category: Record<string, number>;
  by_property: PropertySummary[];
  by_month: MonthSummary[];
  by_month_expense: MonthExpenseSummary[];
  by_month_revenue: MonthRevenueSummary[];
  by_property_month: PropertyMonthlySummary[];
}
