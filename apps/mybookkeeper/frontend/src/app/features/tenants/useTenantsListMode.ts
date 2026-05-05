import type { TenantsListMode } from "@/shared/types/applicant/tenants-list-mode";

interface UseTenantsListModeArgs {
  isLoading: boolean;
  isError: boolean;
  tenantCount: number;
}

/**
 * Resolves the tenants list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useTenantsListMode({
  isLoading,
  isError,
  tenantCount,
}: UseTenantsListModeArgs): TenantsListMode {
  if (isLoading) return "loading";
  if (tenantCount === 0 && !isError) return "empty";
  return "list";
}
