import type { RateWatchMode } from "@/shared/types/insurance/rate-watch-mode";

export interface UseRateWatchModeArgs {
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
export function useRateWatchMode({
  hasChecked,
  isFetching,
  isError,
  outlookCount,
}: UseRateWatchModeArgs): RateWatchMode {
  if (isFetching) return "loading";
  if (!hasChecked) return "idle";
  if (isError) return "error";
  if (outlookCount === 0) return "empty";
  return "results";
}
