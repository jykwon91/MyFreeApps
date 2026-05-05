/**
 * Body of the research panel — flat switch over CompanyResearchMode.
 *
 * Does not own any state or data-fetching — all props are passed in by
 * CompanyResearchPanel. Each mode branch is a separate file under research/.
 */
import type { CompanyResearchMode } from "@/features/companies/useCompanyResearchMode";
import type { CompanyResearch } from "@/types/company-research";
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
}

export default function CompanyResearchPanelBody({
  mode,
  research,
  onRunResearch,
  isRunning,
  errorMessage,
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
      return <FailedState errorMessage={errorMessage} onRunResearch={onRunResearch} isRunning={isRunning} />;
  }
}
