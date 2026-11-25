import type { MonthlyExpensesQuery } from "./monthly-expenses-query";

/** The payments behind one heading, over the same months and money as the page. */
export interface MonthlyExpenseCategoryQuery extends MonthlyExpensesQuery {
  label: string;
}
