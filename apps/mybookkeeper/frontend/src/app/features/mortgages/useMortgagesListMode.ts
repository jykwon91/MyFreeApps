import type { MortgagesListMode } from "@/shared/types/mortgage/mortgages-list-mode";

export interface UseMortgagesListModeArgs {
  isLoading: boolean;
  mortgageCount: number;
}

/**
 * Resolves the mortgage list's render mode.
 *
 * Single source of truth so the body is a flat switch rather than a ternary
 * chain, and so the skeleton and the list can never disagree about which state
 * is showing.
 */
export function useMortgagesListMode({
  isLoading,
  mortgageCount,
}: UseMortgagesListModeArgs): MortgagesListMode {
  if (isLoading) return "loading";
  if (mortgageCount === 0) return "empty";
  return "list";
}
