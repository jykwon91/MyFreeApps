/**
 * Body of the research panel — flat switch over CompanyResearchMode.
 *
 * Does not own any state or data-fetching — all props are passed in by
 * CompanyResearchPanel. Each mode branch is a separate file under research/.
 */
import type { CompanyResearchMode } from "@myjobhunter/api-client/types/company/company-research-mode";
import type { CompanyResearch } from "@myjobhunter/api-client/types/company-research";
import NoResearchState from "./research/NoResearchState";
import LoadingState from "./research/LoadingState";
import ReadyState from "./research/ReadyState";
import FailedState from "./research/FailedState";

interface CompanyResearchPanelBodyProps {
  mode: CompanyResearchMode;
  research: CompanyResearch | undefined;
  onRunResearch: () => void;
  isRunning: boolean;
  errorMessage: string | null;
  /** False when the last run failed in a way retrying can't fix. */
  canRetry: boolean;
}

export default function CompanyResearchPanelBody({
  mode,
  research,
  onRunResearch,
  isRunning,
  errorMessage,
  canRetry,
}: CompanyResearchPanelBodyProps) {
  switch (mode) {
    case "no-research":
      return <NoResearchState onRunResearch={onRunResearch} isRunning={isRunning} />;
    case "loading":
      return <LoadingState />;
    case "ready":
      return research ? (
        <ReadyState research={research} onRunResearch={onRunResearch} isRunning={isRunning} />
      ) : null;
    case "failed":
      return <FailedState errorMessage={errorMessage} onRunResearch={onRunResearch} isRunning={isRunning} canRetry={canRetry} />;
  }
}
