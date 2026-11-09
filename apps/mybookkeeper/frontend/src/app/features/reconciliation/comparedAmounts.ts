import { discrepancyTone } from "@mybookkeeper/api-client/utils/reconciliationCompare";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import { formatCurrency } from "@/shared/utils/currency";

const NOT_COMPARED = { recordsTotal: "—", discrepancy: "—", discrepancyClass: "" };

export function comparedAmounts(source: ReconciliationSource) {
  const tone = discrepancyTone(source);
  if (tone === "notCompared") return NOT_COMPARED;
  return {
    recordsTotal: formatCurrency(source.matched_amount),
    discrepancy: formatCurrency(source.discrepancy),
    discrepancyClass: tone === "clear" ? "text-green-600" : "text-amber-600",
  };
}
