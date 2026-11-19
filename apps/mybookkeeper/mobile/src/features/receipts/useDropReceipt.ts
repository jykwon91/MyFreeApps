import { rentReceiptsApi } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { useStore } from "react-redux";
import type { AppStore } from "../../lib/store";

/**
 * Takes a finished receipt off every loaded list, and its own lookup, at once, so it can't be tapped
 * again even when the reload after it fails. A list that never had the row is left to that reload.
 */
export function useDropReceipt(): (transactionId: string) => void {
  const store = useStore() as AppStore;
  return (transactionId) => {
    const isOther = (item: { transaction_id: string }) => item.transaction_id !== transactionId;
    for (const args of rentReceiptsApi.util.selectCachedArgsForQuery(store.getState(), "getPendingReceipts")) {
      store.dispatch(
        rentReceiptsApi.util.updateQueryData("getPendingReceipts", args, (draft) => {
          const kept = draft.items.filter(isOther);
          if (kept.length === draft.items.length) return;
          draft.items = kept;
          draft.pending_count = Math.max(0, draft.pending_count - 1);
          draft.total = Math.max(0, draft.total - 1);
        }),
      );
    }
    store.dispatch(
      rentReceiptsApi.util.updateQueryData("listPendingReceiptPages", undefined, (draft) => {
        if (draft.pages.every((page) => page.items.every(isOther))) return;
        for (const page of draft.pages) {
          page.items = page.items.filter(isOther);
          page.pending_count = Math.max(0, page.pending_count - 1);
          page.total = Math.max(0, page.total - 1);
        }
      }),
    );
    store.dispatch(
      rentReceiptsApi.util.updateQueryData("getPendingReceipt", transactionId, (draft) => {
        draft.item = null;
      }),
    );
  };
}
