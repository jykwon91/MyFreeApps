import type { FinancialAccount } from "./financial-account";
import type { FinancialAccountTotals } from "./financial-account-totals";

/** Every account, open or closed, plus totals per currency. Not paged: a person has tens, not thousands. */
export interface FinancialAccountListResponse {
  items: FinancialAccount[];
  totals: FinancialAccountTotals[];
}
