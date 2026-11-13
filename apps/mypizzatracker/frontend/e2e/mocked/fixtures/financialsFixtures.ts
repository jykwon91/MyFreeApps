/** A drop's financials as GET /financials/drops/{id} answers them (app/schemas/financials/financials_schemas.py). */
import type { DropFinancials, ExpenseCreate, ExpenseRead } from "@/types/financials/financials";
import { DROP_DATE, FIXTURE_NOW } from "../constants/fixtureTimes";
import { ACTIVE_DROP_ID } from "./dropFixtures";
import { expenseIdAt } from "./fixtureIds";

export function expenseOf(n: number, fields: Partial<ExpenseRead> = {}): ExpenseRead {
  return {
    id: expenseIdAt(n),
    drop_id: ACTIVE_DROP_ID,
    vendor: "Costco",
    category: "ingredients",
    amount: "42.00",
    description: null,
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
    ...fields,
  };
}

/** What POST /financials/drops/{id}/expenses answers for `body`. */
export function expenseFromCreate(n: number, body: ExpenseCreate): ExpenseRead {
  return expenseOf(n, { ...body, description: body.description ?? null });
}

/** Totals recomputed from the expenses, the way the backend derives them. */
export function financialsOf(expenses: ExpenseRead[]): DropFinancials {
  const revenue = 120;
  const tip = 15;
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return {
    drop: { id: ACTIVE_DROP_ID, name: "Friday Night Drop", date: DROP_DATE, status: "active" },
    pizza_count: 9,
    revenue: revenue.toFixed(2),
    tip_total: tip.toFixed(2),
    expense_total: expenseTotal.toFixed(2),
    profit: (revenue + tip - expenseTotal).toFixed(2),
    health: "green",
    expenses,
  };
}
