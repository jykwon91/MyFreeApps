import type { CompanyResearchMode } from "../types/company/company-research-mode";
import type { CompanyResearchModeInput } from "../types/company/company-research-mode-input";

/** Which of its four states a company's research panel is in. Shared by the web page and the phone screen. */
export function companyResearchMode({
  research,
  isQueryError,
  queryErrorStatus,
  isMutationLoading,
  isMutationError,
}: CompanyResearchModeInput): CompanyResearchMode {
  if (isMutationLoading) return "loading";
  if (research) return "ready";
  // A failed run says so, even over the GET's "none run yet" 404; a failed re-run keeps the result above.
  if (isMutationError) return "failed";
  if (isQueryError && queryErrorStatus === 404) return "no-research";
  if (isQueryError) return "failed";
  // Before the query has answered: no-research, so the panel renders without flicker.
  return "no-research";
}
