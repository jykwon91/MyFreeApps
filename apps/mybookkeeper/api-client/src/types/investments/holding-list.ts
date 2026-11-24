import type { Holding } from "./holding";
import type { HoldingAllocation } from "./holding-allocation";
import type { HoldingTotals } from "./holding-totals";

/** ``GET /holdings``: largest first, with totals and the split by type. */
export interface HoldingList {
  /** The account the list is narrowed to, or null for every account. */
  financial_account_id: string | null;
  currency: string;
  holdings: Holding[];
  totals: HoldingTotals;
  allocation: HoldingAllocation[];
}
