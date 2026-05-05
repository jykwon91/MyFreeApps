import type { ApplicantsListMode } from "@/shared/types/applicant/applicants-list-mode";

interface UseApplicantsListModeArgs {
  isLoading: boolean;
  isEmpty: boolean;
}

/**
 * Resolves the render mode for ApplicantsListBody. Single source of truth
 * so the body component is a flat switch instead of a tower of conditionals.
 *
 * Error state is handled separately by the page (AlertBox) and does not
 * drive a mode — the list can show stale items alongside an error banner.
 */
export function useApplicantsListMode({
  isLoading,
  isEmpty,
}: UseApplicantsListModeArgs): ApplicantsListMode {
  if (isLoading) return "loading";
  if (isEmpty) return "empty";
  return "list";
}
