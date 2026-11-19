import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { InsurancePolicySummary } from "./insurance-policy-summary";

/** A paged insurance policies list, as a screen needs it: `policies` is every loaded row, in the server's order. */
export interface InsurancePoliciesPagesState extends Omit<InfinitePagesResult<InsurancePolicySummary>, "items"> {
  policies: InsurancePolicySummary[];
}
