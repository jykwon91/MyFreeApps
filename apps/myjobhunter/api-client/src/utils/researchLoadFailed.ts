import type { CompanyResearchMode } from "../types/company/company-research-mode";

/**
 * Whether the panel is "failed" because the research couldn't be loaded, not because a run failed.
 * Its retry is a refetch: a run costs a paid AI call and must never start from a failed read.
 */
export function researchLoadFailed(mode: CompanyResearchMode, isMutationError: boolean): boolean {
  return mode === "failed" && !isMutationError;
}
