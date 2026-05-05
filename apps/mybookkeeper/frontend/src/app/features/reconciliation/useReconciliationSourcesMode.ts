import type { ReconciliationSource } from "@/shared/types/reconciliation/reconciliation-source";
import type { ReconciliationSourcesMode } from "@/shared/types/reconciliation/reconciliation-sources-mode";

interface UseReconciliationSourcesModeArgs {
  isLoading: boolean;
  sources: readonly ReconciliationSource[];
}

/**
 * Resolves the render mode for the ReconciliationWizard sources step.
 * Single source of truth so the body component is a flat switch.
 */
export function useReconciliationSourcesMode({
  isLoading,
  sources,
}: UseReconciliationSourcesModeArgs): ReconciliationSourcesMode {
  if (isLoading) return "loading";
  if (sources.length === 0) return "empty";
  return "list";
}
