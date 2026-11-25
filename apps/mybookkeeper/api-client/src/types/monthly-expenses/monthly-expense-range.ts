import type { MONTHLY_EXPENSE_RANGES } from "../../constants/monthlyExpenses";

export type MonthlyExpenseRange = (typeof MONTHLY_EXPENSE_RANGES)[number]["key"];
