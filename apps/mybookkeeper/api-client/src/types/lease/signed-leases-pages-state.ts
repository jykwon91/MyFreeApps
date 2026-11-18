import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { SignedLeaseSummary } from "./signed-lease-summary";

/** A paged signed-leases list, as a screen needs it: `leases` is every loaded row, in the server's order. */
export interface SignedLeasesPagesState extends Omit<InfinitePagesResult<SignedLeaseSummary>, "items"> {
  leases: SignedLeaseSummary[];
}
