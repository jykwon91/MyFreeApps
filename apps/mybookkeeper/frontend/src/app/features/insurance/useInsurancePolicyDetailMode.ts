import type { InsurancePolicyDetailMode } from "@/shared/types/insurance/insurance-policy-detail-mode";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";

interface UseInsurancePolicyDetailModeArgs {
  isLoading: boolean;
  isError: boolean;
  policy: InsurancePolicyDetail | undefined;
}

/**
 * Resolves the insurance policy detail render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a nested ternary chain.
 *
 * When isError is true the parent already shows an AlertBox, so this hook
 * returns "loading" (showing the skeleton) only when we have neither data
 * nor an error — i.e. the first network request is in-flight.
 */
export function useInsurancePolicyDetailMode({
  isLoading,
  isError,
  policy,
}: UseInsurancePolicyDetailModeArgs): InsurancePolicyDetailMode | null {
  if (isError) return null;
  if (isLoading || !policy) return "loading";
  return "content";
}
