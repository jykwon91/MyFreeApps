import { RECONCILIATION_COMPARE_MESSAGES as MESSAGES } from "../constants/reconciliationCompare";
import { httpStatus } from "./httpStatus";
import type { DiscrepancyTone } from "../types/reconciliation/discrepancy-tone";
import type { AutoReconcileResult } from "../types/reconciliation/auto-reconcile-result";
import type { ReconciliationSource } from "../types/reconciliation/reconciliation-source";

/** Before a comparison the record total is just $0, so the whole form would read as a gap. */
export function hasBeenCompared(source: ReconciliationSource): boolean {
  return source.status !== "unmatched";
}

export function compareResultMessage(result: AutoReconcileResult): string {
  const { auto_matched: matched, discrepancies: differ, sources_checked: checked } = result;
  if (matched + differ === 0) return MESSAGES.nothingFound;
  const summary = `${matched} matched, ${differ} ${differ === 1 ? "differs" : "differ"}.`;
  const skipped = checked - matched - differ;
  return skipped > 0 ? `${summary} ${skipped} had nothing to compare.` : summary;
}

export function compareFailureMessage(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MESSAGES.compareUnreachable;
    case 403:
      return MESSAGES.viewerRefused;
    default:
      return MESSAGES.compareFailed;
  }
}

/** What a comparison tells the person, and whether it found any income to compare. */
export function compareOutcome(taxYear: number, result: AutoReconcileResult): { message: string; variant: "success" | "error" } {
  const foundIncome = result.auto_matched + result.discrepancies > 0;
  return { message: `${taxYear}: ${compareResultMessage(result)}`, variant: foundIncome ? "success" : "error" };
}

/** A form that hasn't been compared has no gap to show, and one that has is clear only at exactly zero. */
export function discrepancyTone(source: ReconciliationSource): DiscrepancyTone {
  if (!hasBeenCompared(source)) return "notCompared";
  return parseFloat(source.discrepancy) === 0 ? "clear" : "differs";
}
