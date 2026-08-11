import type { BetterPlansMode } from "@/shared/types/utility/better-plans-mode";

export interface UseBetterPlansModeArgs {
  hasSearched: boolean;
  isFetching: boolean;
  isError: boolean;
  groupCount: number;
}

/**
 * Resolves the better-plans render mode.
 *
 * Single source of truth so the body is a flat switch rather than a ternary
 * chain, and so the skeleton and the results can never disagree about which
 * state is showing.
 */
export function useBetterPlansMode({
  hasSearched,
  isFetching,
  isError,
  groupCount,
}: UseBetterPlansModeArgs): BetterPlansMode {
  if (isFetching) return "loading";
  if (!hasSearched) return "idle";
  if (isError) return "error";
  if (groupCount === 0) return "empty";
  return "results";
}
