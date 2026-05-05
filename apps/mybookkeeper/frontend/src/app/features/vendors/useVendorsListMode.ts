import type { VendorsListMode } from "@/shared/types/vendor/vendors-list-mode";

interface UseVendorsListModeArgs {
  isLoading: boolean;
  isError: boolean;
  vendorCount: number;
}

/**
 * Resolves the vendors list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useVendorsListMode({
  isLoading,
  isError,
  vendorCount,
}: UseVendorsListModeArgs): VendorsListMode {
  if (isLoading) return "loading";
  if (vendorCount === 0 && !isError) return "empty";
  return "list";
}
