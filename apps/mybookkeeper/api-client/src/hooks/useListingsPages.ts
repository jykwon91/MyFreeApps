import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListListingPagesInfiniteQuery } from "../store/listingsApi";
import type { ListingPageArgs } from "../types/listing/listing-page-args";
import type { ListingsPagesState } from "../types/listing/listings-pages-state";

/** GET /listings a page at a time, narrowed by status. Each "Load more" asks for the next page by offset. */
export function useListingsPages(args: ListingPageArgs): ListingsPagesState {
  const { items, ...pages } = useInfinitePages(useListListingPagesInfiniteQuery(args));
  return { ...pages, listings: items };
}
