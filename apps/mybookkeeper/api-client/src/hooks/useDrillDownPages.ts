import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListDrillDownPagesInfiniteQuery } from "../store/transactionsApi";
import type { DrillDownScope } from "../types/analytics/drill-down-scope";
import type { DrillDownPagesState } from "../types/transaction/DrillDownPagesState";
import { drillDownAmountTotal, drillDownListParams } from "../utils/drillDown";

/** The transactions behind a tapped figure, a page at a time, with the server's count and total. Shared by the website and the phone. */
export function useDrillDownPages(filter: DrillDownScope): DrillDownPagesState {
  const query = useListDrillDownPagesInfiniteQuery(drillDownListParams(filter));
  const { items, ...pages } = useInfinitePages(query);
  const amountTotal = drillDownAmountTotal((query.currentData ?? query.data)?.pages ?? []);
  return { ...pages, transactions: items, amountTotal };
}
