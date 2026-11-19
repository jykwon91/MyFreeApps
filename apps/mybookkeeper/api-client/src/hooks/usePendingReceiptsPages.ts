import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListPendingReceiptPagesInfiniteQuery } from "../store/rentReceiptsApi";
import type { PendingReceiptsPagesState } from "../types/lease/pending-receipts-pages-state";

/** GET /rent-receipts/pending a page at a time. Shared by the website's Pending Receipts page and the phone's Receipts screen. */
export function usePendingReceiptsPages(): PendingReceiptsPagesState {
  const query = useListPendingReceiptPagesInfiniteQuery();
  const { items, ...pages } = useInfinitePages(query);
  // The latest page's answer, as `total` is the latest page's count.
  const loaded = (query.currentData ?? query.data)?.pages ?? [];
  const gmailState = loaded.length > 0 ? loaded[loaded.length - 1].gmail_state : "ready";
  return { ...pages, receipts: items, gmailState };
}
