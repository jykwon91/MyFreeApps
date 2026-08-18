import type { MortgageRateWatchMode } from "@/shared/types/mortgage/mortgage-rate-watch-mode";

export interface UseMortgageRateWatchModeArgs {
  hasChecked: boolean;
  isFetching: boolean;
  isError: boolean;
  outlookCount: number;
}

/**
 * Resolves the rate-watch render mode.
 *
 * Single source of truth so the body is a flat switch rather than a ternary
 * chain, and so the skeleton and the results can never disagree about which
 * state is showing.
 */
export function useMortgageRateWatchMode({
  hasChecked,
  isFetching,
  isError,
  outlookCount,
}: UseMortgageRateWatchModeArgs): MortgageRateWatchMode {
  if (isFetching) return "loading";
  if (!hasChecked) return "idle";
  if (isError) return "error";
  if (outlookCount === 0) return "empty";
  return "results";
}
