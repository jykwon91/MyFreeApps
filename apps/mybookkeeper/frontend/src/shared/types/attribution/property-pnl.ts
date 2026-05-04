export interface ExpenseBreakdown {
  category: string;
  amount_cents: number;
}

export interface PropertyPnLEntry {
  property_id: string;
  name: string;
  revenue_cents: number;
  expenses_cents: number;
  net_cents: number;
  expense_breakdown: ExpenseBreakdown[];
}

export interface PropertyPnLResponse {
  since: string;
  until: string;
  properties: PropertyPnLEntry[];
  total_revenue_cents: number;
  total_expenses_cents: number;
  total_net_cents: number;
}
