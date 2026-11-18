import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import ApplicantsListSkeleton from "./ApplicantsListSkeleton";
import ApplicantsEmptyState from "./ApplicantsEmptyState";
import ApplicantsList from "./ApplicantsList";

export interface ApplicantsListBodyProps {
  mode: ListLoadMode;
  applicants: readonly ApplicantSummary[];
  showStageBadge: boolean;
  isFiltered: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export default function ApplicantsListBody({
  mode,
  applicants,
  showStageBadge,
  isFiltered,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: ApplicantsListBodyProps) {
  switch (mode) {
    case "error":
      // The page's LoadErrorAlert says the list couldn't load.
      return null;
    case "loading":
      return <ApplicantsListSkeleton />;
    case "empty":
      return <ApplicantsEmptyState isFiltered={isFiltered} />;
    case "list":
      return (
        <ApplicantsList
          applicants={applicants}
          showStageBadge={showStageBadge}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
        />
      );
  }
}
