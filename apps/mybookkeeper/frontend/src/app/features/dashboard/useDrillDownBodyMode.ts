import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DrillDownBodyMode } from "@/shared/types/dashboard/drill-down-body-mode";

interface UseDrillDownBodyModeArgs {
  selectedTxn: Transaction | null;
  isLoading: boolean;
  transactionCount: number;
}

/**
 * Resolves the DrillDownPanel body render mode from the current state.
 * Single source of truth so the body component is a flat switch instead of
 * a tower of conditionals.
 */
export function useDrillDownBodyMode({
  selectedTxn,
  isLoading,
  transactionCount,
}: UseDrillDownBodyModeArgs): DrillDownBodyMode {
  if (selectedTxn) return "detail";
  if (isLoading) return "loading";
  if (transactionCount === 0) return "empty";
  return "list";
}
