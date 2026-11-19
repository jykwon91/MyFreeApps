import DrillDownEmptyState from "./DrillDownEmptyState";
import DrillDownList from "./DrillDownList";
import DrillDownLoadingState from "./DrillDownLoadingState";
import DrillDownLoadMore from "./DrillDownLoadMore";
import { LIST_LOAD_MODE } from "@/shared/lib/list-load-modes";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

export interface DrillDownListContentProps {
  mode: ListLoadMode;
  /** The rows loaded so far, a server page at a time. */
  transactions: readonly Transaction[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onSelectTxn: (txn: Transaction) => void;
}

/** The list side of the drill-down: its skeleton, nothing when it failed (DrillDownErrorState says so), empty, or the rows. */
export default function DrillDownListContent({
  mode,
  transactions,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelectTxn,
}: DrillDownListContentProps) {
  switch (mode) {
    case LIST_LOAD_MODE.loading:
      return <DrillDownLoadingState />;
    case LIST_LOAD_MODE.error:
      return null;
    case LIST_LOAD_MODE.empty:
      return <DrillDownEmptyState />;
    case LIST_LOAD_MODE.list:
      return (
        <>
          <DrillDownList transactions={transactions} onSelectTxn={onSelectTxn} />
          <DrillDownLoadMore hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />
        </>
      );
  }
}
