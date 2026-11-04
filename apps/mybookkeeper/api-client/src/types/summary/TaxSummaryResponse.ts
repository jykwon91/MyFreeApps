import type { TaxPropertySummary } from "./TaxPropertySummary";
import type { W2Income } from "./W2Income";

export interface TaxSummaryResponse {
  year: number;
  gross_revenue: number;
  total_deductions: number;
  net_taxable_income: number;
  by_category: Record<string, number>;
  by_property: TaxPropertySummary[];
  w2_income: W2Income[];
  w2_total: number;
  total_income: number;
}
