import { RECONCILIATION_COMPARE_MESSAGES as MESSAGES } from "../constants/reconciliationCompare";
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
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  switch (status) {
    case undefined:
      return MESSAGES.compareUnreachable;
    case 403:
      return MESSAGES.viewerRefused;
    default:
      return MESSAGES.compareFailed;
  }
}
