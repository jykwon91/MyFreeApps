import type { ReconciliationDiscrepanciesMode } from "../types/reconciliation/reconciliation-discrepancies-mode";
import type { ReconciliationSourcesMode } from "../types/reconciliation/reconciliation-sources-mode";

/** What the sources list shows. One answer, so the skeleton, the empty state and the rows can't disagree. */
export function reconciliationSourcesMode(isLoading: boolean, sourceCount: number): ReconciliationSourcesMode {
  if (isLoading) return "loading";
  if (sourceCount === 0) return "empty";
  return "list";
}

/** What the discrepancies list shows. */
export function reconciliationDiscrepanciesMode(isLoading: boolean, count: number): ReconciliationDiscrepanciesMode {
  if (isLoading) return "loading";
  if (count === 0) return "empty";
  return "list";
}
