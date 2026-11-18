import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { VendorSummary } from "./vendor-summary";

/** A paged vendors list, as a screen needs it: `vendors` is every loaded row, in the server's order. */
export interface VendorsPagesState extends Omit<InfinitePagesResult<VendorSummary>, "items"> {
  vendors: VendorSummary[];
}
