import type { LeaseTemplatesListMode } from "@/shared/types/lease/lease-templates-list-mode";

interface UseLeaseTemplatesListModeArgs {
  isLoading: boolean;
  isError: boolean;
  templateCount: number;
}

/**
 * Resolves the lease templates list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useLeaseTemplatesListMode({
  isLoading,
  isError,
  templateCount,
}: UseLeaseTemplatesListModeArgs): LeaseTemplatesListMode {
  if (isLoading) return "loading";
  if (templateCount === 0 && !isError) return "empty";
  return "list";
}
