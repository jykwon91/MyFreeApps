import { CASH_FLOW_DEFAULT_SCOPE, CASH_FLOW_SCOPES } from "@mybookkeeper/api-client/constants/budget";
import { MONTHLY_EXPENSE_DEFAULT_RANGE, MONTHLY_EXPENSE_RANGES } from "@mybookkeeper/api-client/constants/monthlyExpenses";
import type { CashFlowScope } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-scope";
import type { MonthlyExpenseRange } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-range";
import type { MonthlyExpensesQuery } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses-query";

function isRange(value: string | null): value is MonthlyExpenseRange {
  return MONTHLY_EXPENSE_RANGES.some((option) => option.key === value);
}

function isScope(value: string | null): value is CashFlowScope {
  return CASH_FLOW_SCOPES.some((option) => option.key === value);
}

/** ``?range=&scope=`` read back, anything unknown falling back to the defaults. */
export function monthlyExpensesQueryFrom(params: URLSearchParams): MonthlyExpensesQuery {
  const range = params.get("range");
  const scope = params.get("scope");
  return {
    range: isRange(range) ? range : MONTHLY_EXPENSE_DEFAULT_RANGE,
    scope: isScope(scope) ? scope : CASH_FLOW_DEFAULT_SCOPE,
  };
}

/** The query as URL params, leaving out defaults so the plain page URL stays plain. */
export function monthlyExpensesSearchParams(query: MonthlyExpensesQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.range !== MONTHLY_EXPENSE_DEFAULT_RANGE) params.range = query.range;
  if (query.scope !== CASH_FLOW_DEFAULT_SCOPE) params.scope = query.scope;
  return params;
}
