import type { MonthSummary } from "./month-summary";
import type { MonthExpenseSummary } from "./month-expense-summary";
import type { PropertySummary } from "./property-summary";
import type { PropertyMonthlySummary } from "./property-monthly-summary";

export interface SummaryResponse {
  revenue: number;
  expenses: number;
  profit: number;
  by_category: Record<string, number>;
  by_property: PropertySummary[];
  by_month: MonthSummary[];
  by_month_expense: MonthExpenseSummary[];
  by_property_month: PropertyMonthlySummary[];
}
