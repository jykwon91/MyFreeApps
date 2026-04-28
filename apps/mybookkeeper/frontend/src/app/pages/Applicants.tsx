import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import {
  APPLICANT_PAGE_SIZE,
  APPLICANT_STAGES,
} from "@/shared/lib/applicant-labels";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";
import ApplicantsListSkeleton from "@/app/features/applicants/ApplicantsListSkeleton";
import ApplicantStageFilter from "@/app/features/applicants/ApplicantStageFilter";
import ApplicantCard from "@/app/features/applicants/ApplicantCard";
import ApplicantRow from "@/app/features/applicants/ApplicantRow";

const STAGE_PARAM = "stage";

function parseStageParam(value: string | null): ApplicantStage | null {
  if (value === null) return null;
  return (APPLICANT_STAGES as readonly string[]).includes(value)
    ? (value as ApplicantStage)
    : null;
}

export default function Applicants() {
  const [searchParams, setSearchParams] = useSearchParams();
  const stage = parseStageParam(searchParams.get(STAGE_PARAM));
  const [pageCount, setPageCount] = useState(1);

  const queryArgs = useMemo(
    () => ({
      ...(stage ? { stage } : {}),
      limit: APPLICANT_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [stage, pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } =
    useGetApplicantsQuery(queryArgs);

  const applicants = data?.items ?? [];
  const hasMore = data?.has_more ?? false;
  const isFiltered = stage !== null;
  const showStageBadge = stage === null;

  function handleFilterChange(next: ApplicantStage | null) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set(STAGE_PARAM, next);
    } else {
      params.delete(STAGE_PARAM);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Applicants"
        subtitle="People you've promoted from inquiries — track screening and approvals here."
      />

      <ApplicantStageFilter value={stage} onChange={handleFilterChange} />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your applicants. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading ? (
        <ApplicantsListSkeleton />
      ) : applicants.length === 0 && !isError ? (
        <EmptyState
          message={
            isFiltered
              ? "No applicants in this stage. Try a different filter."
              : "No applicants yet — they'll show up here once you promote an inquiry."
          }
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="applicants-mobile">
            {applicants.map((applicant) => (
              <li key={applicant.id}>
                <ApplicantCard
                  applicant={applicant}
                  showStageBadge={showStageBadge}
                />
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
                onClick={handleLoadMore}
                isLoading={isFetching}
                loadingText="Loading..."
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
