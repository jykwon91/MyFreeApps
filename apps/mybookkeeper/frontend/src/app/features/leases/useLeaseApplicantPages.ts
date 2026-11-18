import { useMemo } from "react";
import { useApplicantsPages } from "@mybookkeeper/api-client/hooks/useApplicantsPages";
import { flattenPagesById } from "@platform/core/utils/flattenPagesById";
import { LEASE_ELIGIBLE_STAGES } from "@/shared/lib/lease-generate-constants";
import type { LeaseApplicantPages } from "@/shared/types/lease-applicant-pages";

const [APPROVED, LEASE_SENT] = LEASE_ELIGIBLE_STAGES;

/**
 * Pages through the applicants a lease can be generated for.
 *
 * The server filters on one stage at a time, so each eligible stage is its own paged list, and
 * "Load more" advances every stage that has more. Data counts as loaded only once both first pages
 * are in, so the picker never claims nobody is ready while one stage is still loading.
 */
export function useLeaseApplicantPages(): LeaseApplicantPages {
  const approved = useApplicantsPages({ stage: APPROVED });
  const leaseSent = useApplicantsPages({ stage: LEASE_SENT });
  const stages = [approved, leaseSent];

  // An applicant can briefly sit in both stages while one is mid-move, so rows are unique across them.
  const applicants = useMemo(
    () => flattenPagesById([{ items: [...approved.applicants, ...leaseSent.applicants], total: 0 }]),
    [approved.applicants, leaseSent.applicants],
  );
  const loadMoreFailed = stages.some((s) => s.isLoadMoreError);

  function retry(): void {
    if (loadMoreFailed) {
      stages.filter((s) => s.isLoadMoreError).forEach((s) => s.loadMore());
      return;
    }
    stages.filter((s) => s.loadError !== undefined || s.error !== undefined).forEach((s) => void s.refetch());
  }

  return {
    applicants,
    hasData: stages.every((s) => s.hasData),
    hasError: stages.some((s) => s.error !== undefined),
    isLoading: stages.some((s) => s.isLoading),
    hasNextPage: stages.some((s) => s.hasNextPage),
    isFetchingNextPage: stages.some((s) => s.isFetchingNextPage),
    loadMoreFailed,
    loadMore: () => stages.filter((s) => s.hasNextPage).forEach((s) => s.loadMore()),
    retry,
  };
}
