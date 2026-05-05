import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import {
  APPLICANT_PAGE_SIZE,
  APPLICANT_STAGES,
} from "@/shared/lib/applicant-labels";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";
import ApplicantStageFilter from "@/app/features/applicants/ApplicantStageFilter";
import ApplicantsListBody from "@/app/features/applicants/ApplicantsListBody";
import { useApplicantsListMode } from "@/app/features/applicants/useApplicantsListMode";

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

  const mode = useApplicantsListMode({
    isLoading,
    isEmpty: applicants.length === 0 && !isError,
  });

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

      <ApplicantsListBody
        mode={mode}
        applicants={applicants}
        showStageBadge={showStageBadge}
        isFiltered={isFiltered}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
      />
    </main>
  );
}
