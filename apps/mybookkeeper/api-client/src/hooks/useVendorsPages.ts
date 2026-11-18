import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListVendorPagesInfiniteQuery } from "../store/vendorsApi";
import type { VendorPageArgs } from "../types/vendor/vendor-page-args";
import type { VendorsPagesState } from "../types/vendor/vendors-pages-state";

/** GET /vendors a page at a time, narrowed by category and preferred. Each "Load more" asks for the next page by offset. */
export function useVendorsPages(args: VendorPageArgs): VendorsPagesState {
  const { items, ...pages } = useInfinitePages(useListVendorPagesInfiniteQuery(args));
  return { ...pages, vendors: items };
}
