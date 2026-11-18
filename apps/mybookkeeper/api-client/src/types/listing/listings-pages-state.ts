import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { ListingSummary } from "./listing-summary";

/** A paged listings list, as a screen needs it: `listings` is every loaded row, in the server's order. */
export interface ListingsPagesState extends Omit<InfinitePagesResult<ListingSummary>, "items"> {
  listings: ListingSummary[];
}
