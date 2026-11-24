import type { CashFlowRange } from "./cash-flow-range";
import type { CashFlowScope } from "./cash-flow-scope";

/** What the cash flow page asks for. ``accountId`` null is every account. */
export interface CashFlowQuery {
  range: CashFlowRange;
  scope: CashFlowScope;
  accountId: string | null;
}
