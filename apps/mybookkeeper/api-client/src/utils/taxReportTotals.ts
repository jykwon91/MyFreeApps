import { TAX_REPORT_HEADLINE_LABELS } from "../constants/taxReport";
import type { TaxSummaryResponse } from "../types/summary/TaxSummaryResponse";

export function hasW2Income(summary: Pick<TaxSummaryResponse, "w2_total">): boolean {
  return (summary.w2_total ?? 0) > 0;
}

/** With W-2 wages the headline is everything earned less deductions; without, it's the rental net. */
export function taxReportHeadline(
  summary: Pick<TaxSummaryResponse, "w2_total" | "total_income" | "total_deductions" | "net_taxable_income">,
): { label: string; amount: number } {
  if (hasW2Income(summary)) return { label: TAX_REPORT_HEADLINE_LABELS.withWages, amount: (summary.total_income ?? 0) - summary.total_deductions };
  return { label: TAX_REPORT_HEADLINE_LABELS.rentalOnly, amount: summary.net_taxable_income };
}
