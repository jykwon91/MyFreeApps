import type { FinancialAccount } from "./financial-account";

/** Open accounts split by what they are, with closed ones set apart. */
export interface FinancialAccountGroups {
  assets: FinancialAccount[];
  liabilities: FinancialAccount[];
  closed: FinancialAccount[];
}
