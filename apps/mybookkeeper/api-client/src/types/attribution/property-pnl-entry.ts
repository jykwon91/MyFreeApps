import type { ExpenseBreakdown } from "./expense-breakdown";

export interface PropertyPnLEntry {
  property_id: string;
  name: string;
  revenue_cents: number;
  expenses_cents: number;
  net_cents: number;
  expense_breakdown: ExpenseBreakdown[];
}
