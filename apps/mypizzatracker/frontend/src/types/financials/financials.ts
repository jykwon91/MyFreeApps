/**
 * Per-drop financials types -- mirrors backend
 * apps/mypizzatracker/backend/app/schemas/financials/financials_schemas.py.
 *
 * Health enum is shared with backend ``DropHealth``; adding a value here
 * requires updating ``DropHealth`` Literal in the Python schema in the
 * same PR per feedback_enum_changes_cross_stack.md.
 */

export type DropHealth = "green" | "amber" | "red";

export interface DropFinancialsHeader {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  status: "planning" | "active" | "closed";
}

export interface ExpenseRead {
  id: string;
  drop_id: string;
  vendor: string;
  category: string;
  amount: string; // Decimal serialized
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCreate {
  vendor: string;
  category: string;
  amount: string;
  description?: string | null;
}

export interface ExpenseUpdate {
  vendor?: string;
  category?: string;
  amount?: string;
  description?: string | null;
}

export interface DropFinancials {
  drop: DropFinancialsHeader;
  pizza_count: number;
  revenue: string; // Decimal serialized
  tip_total: string;
  expense_total: string;
  profit: string;
  health: DropHealth;
  expenses: ExpenseRead[];
}
