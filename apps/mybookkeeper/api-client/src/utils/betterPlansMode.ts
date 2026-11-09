import type { BetterPlansMode } from "../types/utility/better-plans-mode";
import type { BetterPlansModeArgs } from "../types/utility/better-plans-mode-args";

/**
 * Resolves the better-plans render mode.
 *
 * Single source of truth so the skeleton and the results can never disagree about which
 * state is showing.
 */
export function betterPlansMode({ hasSearched, isFetching, isError, groupCount }: BetterPlansModeArgs): BetterPlansMode {
  if (isFetching) return "loading";
  if (!hasSearched) return "idle";
  if (isError) return "error";
  if (groupCount === 0) return "empty";
  return "results";
}
