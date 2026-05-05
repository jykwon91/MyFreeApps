import type { LeasesListMode } from "@/shared/types/lease/leases-list-mode";

interface UseLeasesListModeArgs {
  isLoading: boolean;
  isError: boolean;
  leaseCount: number;
}

/**
 * Resolves the leases list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useLeasesListMode({
  isLoading,
  isError,
  leaseCount,
}: UseLeasesListModeArgs): LeasesListMode {
  if (isLoading) return "loading";
  if (leaseCount === 0 && !isError) return "empty";
  return "list";
}
