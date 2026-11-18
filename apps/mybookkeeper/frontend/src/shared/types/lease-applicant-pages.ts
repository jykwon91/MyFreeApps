import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";

/** What the lease applicant picker reads from its per-stage paged lists. */
export interface LeaseApplicantPages {
  /** Applicants loaded so far across the eligible stages, each once. */
  applicants: readonly ApplicantSummary[];
  /** Every stage's first page has loaded. */
  hasData: boolean;
  /** Set while any stage's latest load has failed, and stays set through a retry. */
  hasError: boolean;
  /** Any stage has a request in flight: a first load, a refresh, a retry or the next page. */
  isFetching: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** The latest "Load more" failed; the applicants already shown are still good. */
  loadMoreFailed: boolean;
  loadMore: () => void;
  retry: () => void;
}
