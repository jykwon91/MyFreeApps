import { rentReceiptsApi } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { useStore } from "react-redux";
import type { AppStore } from "../../lib/store";

/**
 * Takes a finished receipt off every loaded list at once, so it can't be tapped again
 * even when the reload after it fails. A list that never had the row is left to that reload.
 */
export function useDropReceipt(): (transactionId: string) => void {
  const store = useStore() as AppStore;
  return (transactionId) => {
    for (const args of rentReceiptsApi.util.selectCachedArgsForQuery(store.getState(), "getPendingReceipts")) {
      store.dispatch(
        rentReceiptsApi.util.updateQueryData("getPendingReceipts", args, (draft) => {
          const kept = draft.items.filter((item) => item.transaction_id !== transactionId);
          if (kept.length === draft.items.length) return;
          draft.items = kept;
          draft.pending_count = Math.max(0, draft.pending_count - 1);
          draft.total = Math.max(0, draft.total - 1);
        }),
      );
    }
  };
}
