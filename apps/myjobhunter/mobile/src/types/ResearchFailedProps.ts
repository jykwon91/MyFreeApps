import type { ResearchRunFailure } from "@myjobhunter/api-client/types/company/research-run-failure";

export interface ResearchFailedProps {
  failure: ResearchRunFailure | null;
  isRunning: boolean;
  onRun: () => Promise<void>;
}
