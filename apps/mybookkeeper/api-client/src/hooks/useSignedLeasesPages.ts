import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListSignedLeasePagesInfiniteQuery } from "../store/signedLeasesApi";
import type { SignedLeasePageArgs } from "../types/lease/signed-lease-page-args";
import type { SignedLeasesPagesState } from "../types/lease/signed-leases-pages-state";

/** GET /signed-leases a page at a time, optionally for one group. Each "Load more" asks for the next page by offset. */
export function useSignedLeasesPages(args: SignedLeasePageArgs): SignedLeasesPagesState {
  const { items, ...pages } = useInfinitePages(useListSignedLeasePagesInfiniteQuery(args));
  return { ...pages, leases: items };
}
