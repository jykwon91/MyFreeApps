import type { UtilityPlansListMode } from "@/shared/types/utility/utility-plans-list-mode";

interface UseUtilityPlansListModeArgs {
  isLoading: boolean;
  planCount: number;
}

/**
 * Resolves the utility-plans list render mode. Single source of truth so the
 * body is a flat switch instead of a ternary chain.
 */
export function useUtilityPlansListMode({
  isLoading,
  planCount,
}: UseUtilityPlansListModeArgs): UtilityPlansListMode {
  if (isLoading) return "loading";
  if (planCount === 0) return "empty";
  return "list";
}
