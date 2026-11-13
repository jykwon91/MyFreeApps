/** A drop's financials as GET /financials/drops/{id} answers them (app/schemas/financials/financials_schemas.py). */
import type { Drop } from "@/types/drop/drop";
import type { DropFinancials, DropHealth, ExpenseCreate, ExpenseRead } from "@/types/financials/financials";
import { FIXTURE_NOW } from "../constants/fixtureTimes";
import { HEALTH_GREEN_FLOOR, HEALTH_RED_CEILING } from "../constants/healthThresholds";
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

/** What POST /financials/drops/{dropId}/expenses answers for `body`. */
export function expenseFromCreate(n: number, dropId: string, body: ExpenseCreate): ExpenseRead {
  return expenseOf(n, { ...body, drop_id: dropId, description: body.description ?? null });
}

/** The active drop has sold nine pizzas for $120; the others nothing. */
function salesOf(dropId: string): { pizzaCount: number; revenue: number } {
  return dropId === ACTIVE_DROP_ID ? { pizzaCount: 9, revenue: 120 } : { pizzaCount: 0, revenue: 0 };
}

function healthOf(profit: number): DropHealth {
  if (profit <= HEALTH_RED_CEILING) return "red";
  return profit < HEALTH_GREEN_FLOOR ? "amber" : "green";
}

/** The drop's totals, derived like financials_service.get_financials: revenue plus the drop's tip, less its expenses. */
export function financialsOf(drop: Drop, expenses: ExpenseRead[]): DropFinancials {
  const { pizzaCount, revenue } = salesOf(drop.id);
  const tip = Number(drop.tip_total);
  const own = expenses.filter((expense) => expense.drop_id === drop.id);
  const expenseTotal = own.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const profit = revenue + tip - expenseTotal;
  return {
    drop: { id: drop.id, name: drop.name, date: drop.date, status: drop.status },
    pizza_count: pizzaCount,
    revenue: revenue.toFixed(2),
    tip_total: tip.toFixed(2),
    expense_total: expenseTotal.toFixed(2),
    profit: profit.toFixed(2),
    health: healthOf(profit),
    expenses: own,
  };
}
