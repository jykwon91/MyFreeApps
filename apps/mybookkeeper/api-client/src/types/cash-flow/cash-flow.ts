import type { CashFlowMonth } from "./cash-flow-month";
import type { CashFlowRange } from "./cash-flow-range";
import type { CashFlowScope } from "./cash-flow-scope";
import type { CashFlowTotals } from "./cash-flow-totals";

/** ``GET /cash-flow``: every month in the range, oldest first, empty months included. */
export interface CashFlow {
  range: CashFlowRange;
  scope: CashFlowScope;
  /** The account the figures are narrowed to; null is every account. */
  account_id: string | null;
  currency: string;
  months: CashFlowMonth[];
  totals: CashFlowTotals;
}
