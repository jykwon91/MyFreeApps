import type { CompanyResearch } from "../company-research";

/** The research query's and run mutation's state, as `companyResearchMode` reads it. */
export interface CompanyResearchModeInput {
  research: CompanyResearch | undefined;
  isQueryError: boolean;
  queryErrorStatus: number | undefined;
  isMutationLoading: boolean;
  isMutationError: boolean;
}
