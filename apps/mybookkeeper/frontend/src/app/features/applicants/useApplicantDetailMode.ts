import type { ApplicantDetailMode } from "@/shared/types/applicant/applicant-detail-mode";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";

interface UseApplicantDetailModeArgs {
  isLoading: boolean;
  isError: boolean;
  applicant: ApplicantDetailResponse | undefined;
}

/**
 * Resolves the render mode for ApplicantDetailBody. Single source of truth
 * so the body component is a flat switch instead of a tower of conditionals.
 *
 * Error state is surfaced by the page via AlertBox and does not drive a
 * mode — the skeleton is suppressed when an error is already shown.
 */
export function useApplicantDetailMode({
  isLoading,
  isError,
  applicant,
}: UseApplicantDetailModeArgs): ApplicantDetailMode | null {
  if (isLoading || !applicant) {
    // Suppress the skeleton when an error banner is already shown above.
    return isError ? null : "loading";
  }
  return "content";
}
