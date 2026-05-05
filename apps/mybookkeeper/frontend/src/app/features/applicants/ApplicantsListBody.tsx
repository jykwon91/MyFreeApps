import type { ApplicantsListMode } from "@/shared/types/applicant/applicants-list-mode";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import ApplicantsListSkeleton from "./ApplicantsListSkeleton";
import ApplicantsEmptyState from "./ApplicantsEmptyState";
import ApplicantsList from "./ApplicantsList";

export interface ApplicantsListBodyProps {
  mode: ApplicantsListMode;
  applicants: readonly ApplicantSummary[];
  showStageBadge: boolean;
  isFiltered: boolean;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function ApplicantsListBody({
  mode,
  applicants,
  showStageBadge,
  isFiltered,
  hasMore,
  isFetching,
  onLoadMore,
}: ApplicantsListBodyProps) {
  switch (mode) {
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
          isFetching={isFetching}
          onLoadMore={onLoadMore}
        />
      );
  }
}
