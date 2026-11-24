import type { FinancialAccountClassification } from "../financial-account/financial-account-classification";
import type { NetWorthGroupKey } from "./net-worth-group-key";
import type { NetWorthLine } from "./net-worth-line";

export interface NetWorthGroup {
  key: NetWorthGroupKey;
  classification: FinancialAccountClassification;
  total_cents: number;
  lines: NetWorthLine[];
}
