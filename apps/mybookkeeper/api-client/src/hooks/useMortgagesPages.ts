import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListMortgagePagesInfiniteQuery } from "../store/mortgagesApi";
import type { MortgagesPagesState } from "../types/mortgage/mortgages-pages-state";

/** GET /mortgages a page at a time. Shared by the website's Mortgages page and the phone's. */
export function useMortgagesPages(): MortgagesPagesState {
  const { items, ...pages } = useInfinitePages(useListMortgagePagesInfiniteQuery());
  return { ...pages, mortgages: items };
}
