import type { InquiryDetailMode } from "@/shared/types/inquiry/inquiry-detail-mode";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";

interface UseInquiryDetailModeArgs {
  isLoading: boolean;
  isError: boolean;
  inquiry: InquiryResponse | undefined;
}

/**
 * Resolves the inquiry detail render mode from the loaded state.
 * Single source of truth so the body is a flat switch instead of a nested ternary chain.
 *
 * Returns null when isError is true — the parent shows an AlertBox and nothing else.
 */
export function useInquiryDetailMode({
  isLoading,
  isError,
  inquiry,
}: UseInquiryDetailModeArgs): InquiryDetailMode | null {
  if (isError) return null;
  if (isLoading || !inquiry) return "loading";
  return "content";
}
