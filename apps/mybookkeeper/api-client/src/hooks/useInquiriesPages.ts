import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListInquiryPagesInfiniteQuery } from "../store/inquiriesApi";
import type { InquiryPageArgs } from "../types/inquiry/inquiry-page-args";
import type { InquiriesPagesState } from "../types/inquiry/inquiries-pages-state";

/** GET /inquiries a page at a time, narrowed by stage and spam status. Each "Load more" asks for the next page by offset. */
export function useInquiriesPages(args: InquiryPageArgs): InquiriesPagesState {
  const { items, ...pages } = useInfinitePages(useListInquiryPagesInfiniteQuery(args));
  return { ...pages, inquiries: items };
}
