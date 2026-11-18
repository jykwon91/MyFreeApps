import { useMemo, useState } from "react";
import { useListApplicantPagesInfiniteQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { LEASE_ELIGIBLE_STAGES } from "@/shared/lib/lease-generate-constants";
import type { LeaseApplicantPages } from "@/shared/types/lease-applicant-pages";

const [APPROVED, LEASE_SENT] = LEASE_ELIGIBLE_STAGES;

/**
 * Pages through the applicants a lease can be generated for.
 *
 * The server filters on one stage at a time, so each eligible stage is its own paged query, and
 * "Load more" advances every stage that has more. Data counts as loaded only once both first pages
 * are in, so the picker never claims nobody is ready while one stage is still loading.
 */
export function useLeaseApplicantPages(): LeaseApplicantPages {
  const approved = useListApplicantPagesInfiniteQuery({ stage: APPROVED });
  const leaseSent = useListApplicantPagesInfiniteQuery({ stage: LEASE_SENT });
  const queries = [approved, leaseSent];
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  const applicants = useMemo(() => {
    const rows = [approved.currentData, leaseSent.currentData].flatMap((data) => data?.pages.flatMap((page) => page.items) ?? []);
    return [...new Map(rows.map((applicant) => [applicant.id, applicant])).values()];
  }, [approved.currentData, leaseSent.currentData]);

  async function fetchMore(targets: typeof queries): Promise<void> {
    const results = await Promise.all(targets.filter((q) => q.hasNextPage).map((q) => q.fetchNextPage()));
    setLoadMoreFailed(results.some((result) => result.isError));
  }

  async function retry(): Promise<void> {
    const failed = queries.filter((q) => q.error !== undefined);
    if (loadMoreFailed) return fetchMore(failed);
    await Promise.all(failed.map((q) => q.refetch()));
  }

  return {
    applicants,
    hasData: queries.every((q) => q.currentData !== undefined),
    hasError: queries.some((q) => q.error !== undefined),
    hasNextPage: queries.some((q) => q.hasNextPage),
    isFetching: queries.some((q) => q.isFetching),
    isFetchingNextPage: queries.some((q) => q.isFetchingNextPage),
    loadMoreFailed,
    loadMore: () => fetchMore(queries),
    retry,
  };
}
