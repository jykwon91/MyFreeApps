import LoadingButton from "@/shared/components/ui/LoadingButton";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import ApplicantCard from "./ApplicantCard";
import ApplicantRow from "./ApplicantRow";

export interface ApplicantsListProps {
  applicants: readonly ApplicantSummary[];
  showStageBadge: boolean;
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

export default function ApplicantsList({
  applicants,
  showStageBadge,
  hasMore,
  isFetching,
  onLoadMore,
}: ApplicantsListProps) {
  return (
    <>
      {/* Mobile: cards */}
      <ul className="md:hidden space-y-3" data-testid="applicants-mobile">
        {applicants.map((applicant) => (
          <li key={applicant.id}>
            <ApplicantCard applicant={applicant} showStageBadge={showStageBadge} />
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div
        className="hidden md:block border rounded-lg overflow-hidden"
        data-testid="applicants-desktop"
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Employer</th>
              <th className="px-4 py-2 font-medium">Contract Dates</th>
              <th className="px-4 py-2 font-medium">Promoted</th>
              <th className="px-4 py-2 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody>
            {applicants.map((applicant) => (
              <ApplicantRow key={applicant.id} applicant={applicant} />
            ))}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <LoadingButton
            variant="secondary"
            onClick={onLoadMore}
            isLoading={isFetching}
            loadingText="Loading..."
          >
            Load more
          </LoadingButton>
        </div>
      ) : null}
    </>
  );
}
