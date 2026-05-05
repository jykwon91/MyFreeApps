import type { InquiriesListMode } from "@/shared/types/inquiry/inquiries-list-mode";

interface UseInquiriesListModeArgs {
  isLoading: boolean;
  isError: boolean;
  inquiryCount: number;
}

/**
 * Resolves the inquiries list render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a ternary chain.
 */
export function useInquiriesListMode({
  isLoading,
  isError,
  inquiryCount,
}: UseInquiriesListModeArgs): InquiriesListMode {
  if (isLoading) return "loading";
  if (inquiryCount === 0 && !isError) return "empty";
  return "list";
}
