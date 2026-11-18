import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { ApplicantSummary } from "./applicant-summary";

/** A paged tenants list, as a screen needs it: `tenants` is every loaded row, in the server's order. */
export interface TenantsPagesState extends Omit<InfinitePagesResult<ApplicantSummary>, "items"> {
  tenants: ApplicantSummary[];
}
