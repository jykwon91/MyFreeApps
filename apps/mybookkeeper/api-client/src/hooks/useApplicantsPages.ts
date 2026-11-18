import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListApplicantPagesInfiniteQuery } from "../store/applicantsApi";
import type { ApplicantPageArgs } from "../types/applicant/applicant-page-args";
import type { ApplicantsPagesState } from "../types/applicant/applicants-pages-state";

/** GET /applicants a page at a time, optionally for one stage. */
export function useApplicantsPages(args: ApplicantPageArgs): ApplicantsPagesState {
  const { items, ...pages } = useInfinitePages(useListApplicantPagesInfiniteQuery(args));
  return { ...pages, applicants: items };
}
