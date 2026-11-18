import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { ApplicantSummary } from "./applicant-summary";

/** A paged applicants list, as a screen needs it: `applicants` is every loaded row, in the server's order. */
export interface ApplicantsPagesState extends Omit<InfinitePagesResult<ApplicantSummary>, "items"> {
  applicants: ApplicantSummary[];
}
