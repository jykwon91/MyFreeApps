import {
  CASH_FLOW_DEFAULT_RANGE, CASH_FLOW_DEFAULT_SCOPE, CASH_FLOW_RANGES, CASH_FLOW_SCOPES,
} from "@mybookkeeper/api-client/constants/budget";
import type { CashFlowQuery } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-query";
import type { CashFlowRange } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-range";
import type { CashFlowScope } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-scope";

function isRange(value: string | null): value is CashFlowRange {
  return CASH_FLOW_RANGES.some((option) => option.key === value);
}

function isScope(value: string | null): value is CashFlowScope {
  return CASH_FLOW_SCOPES.some((option) => option.key === value);
}

/** ``?range=&scope=&account=`` read back, anything unknown falling back to the defaults. */
export function cashFlowQueryFrom(params: URLSearchParams): CashFlowQuery {
  const range = params.get("range");
  const scope = params.get("scope");
  const account = params.get("account");
  return {
    range: isRange(range) ? range : CASH_FLOW_DEFAULT_RANGE,
    scope: isScope(scope) ? scope : CASH_FLOW_DEFAULT_SCOPE,
    accountId: account === null || account === "" ? null : account,
  };
}

/** The query as URL params, leaving out defaults so the plain page URL stays plain. */
export function cashFlowSearchParams(query: CashFlowQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.range !== CASH_FLOW_DEFAULT_RANGE) params.range = query.range;
  if (query.scope !== CASH_FLOW_DEFAULT_SCOPE) params.scope = query.scope;
  if (query.accountId !== null) params.account = query.accountId;
  return params;
}
