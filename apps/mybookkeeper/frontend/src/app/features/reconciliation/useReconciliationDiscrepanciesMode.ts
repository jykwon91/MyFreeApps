import type { ReconciliationDiscrepanciesMode } from "@/shared/types/reconciliation/reconciliation-discrepancies-mode";

interface UseReconciliationDiscrepanciesModeArgs {
  isLoading: boolean;
  count: number;
}

/**
 * Resolves the render mode for the ReconciliationWizard discrepancies step.
 * Single source of truth so the body component is a flat switch.
 */
export function useReconciliationDiscrepanciesMode({
  isLoading,
  count,
}: UseReconciliationDiscrepanciesModeArgs): ReconciliationDiscrepanciesMode {
  if (isLoading) return "loading";
  if (count === 0) return "empty";
  return "list";
}
