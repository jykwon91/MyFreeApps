import type { InsurancePoliciesListMode } from "@/shared/types/insurance/insurance-policies-list-mode";

interface UseInsurancePoliciesListModeArgs {
  isLoading: boolean;
  policyCount: number;
}

/**
 * Resolves the insurance policies list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useInsurancePoliciesListMode({
  isLoading,
  policyCount,
}: UseInsurancePoliciesListModeArgs): InsurancePoliciesListMode {
  if (isLoading) return "loading";
  if (policyCount === 0) return "empty";
  return "list";
}
