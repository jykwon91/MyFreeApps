import { hasBeenCompared } from "@mybookkeeper/api-client/utils/reconciliationCompare";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import { formatCurrency } from "@/shared/utils/currency";

const NOT_COMPARED = { recordsTotal: "—", discrepancy: "—", discrepancyClass: "" };

export function comparedAmounts(source: ReconciliationSource) {
  if (!hasBeenCompared(source)) return NOT_COMPARED;
  return {
    recordsTotal: formatCurrency(source.matched_amount),
    discrepancy: formatCurrency(source.discrepancy),
    discrepancyClass: parseFloat(source.discrepancy) === 0 ? "text-green-600" : "text-amber-600",
  };
}
