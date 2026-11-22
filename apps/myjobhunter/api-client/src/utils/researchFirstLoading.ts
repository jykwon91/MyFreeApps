import type { CompanyResearch } from "../types/company-research";
import type { CompanyResearchMode } from "../types/company/company-research-mode";

/** Whether the research query hasn't answered yet, so the panel shows a skeleton rather than "Run research" over research that may exist. */
export function researchFirstLoading(mode: CompanyResearchMode, research: CompanyResearch | undefined, isFetching: boolean): boolean {
  return mode === "no-research" && !research && isFetching;
}
