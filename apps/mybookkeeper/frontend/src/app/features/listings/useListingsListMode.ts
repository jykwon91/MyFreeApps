import type { ListingsListMode } from "@/shared/types/listing/listings-list-mode";

interface UseListingsListModeArgs {
  isLoading: boolean;
  isError: boolean;
  listingCount: number;
}

/**
 * Resolves the listings list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useListingsListMode({
  isLoading,
  isError,
  listingCount,
}: UseListingsListModeArgs): ListingsListMode {
  if (isLoading) return "loading";
  if (listingCount === 0 && !isError) return "empty";
  return "list";
}
