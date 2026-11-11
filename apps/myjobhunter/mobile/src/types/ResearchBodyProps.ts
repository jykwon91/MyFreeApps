import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";
import type { CompanyResearchMode } from "@myjobhunter/api-client/types/company/company-research-mode";
import type { ResearchRunFailure } from "@myjobhunter/api-client/types/company/research-run-failure";

export interface ResearchBodyProps {
  mode: CompanyResearchMode;
  research: CompanyResearch | undefined;
  companyName: string;
  isRunning: boolean;
  /** Why the last run failed, until one succeeds. */
  failure: ResearchRunFailure | null;
  onRun: () => Promise<void>;
}
