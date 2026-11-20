import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListCustomerPagesInfiniteQuery } from "@/store/customersApi";
import type { CustomerPageArgs } from "@/types/customer/customer-page-args";

/** GET /customers a page at a time, narrowed by search. Each "Load more" asks for the next page by offset. */
export function useCustomersPages(args: CustomerPageArgs) {
  return useInfinitePages(useListCustomerPagesInfiniteQuery(args));
}
