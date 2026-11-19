import type { Ref } from "react";
import { useToast } from "@/shared/hooks/useToast";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import DrillDownErrorState from "./DrillDownErrorState";
import DrillDownListContent from "./DrillDownListContent";
import type { TransactionPanelHandle } from "@/shared/types/transaction/transaction-panel-handle";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { PagedListStatus } from "@/shared/types/paged-list-status";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { Property } from "@mybookkeeper/api-client/types/property/property";

export interface DrillDownPanelBodyProps {
  listMode: ListLoadMode;
  /** The paged list's status: its errors, Retry, and whether another page waits. */
  pages: PagedListStatus & { hasNextPage: boolean };
  /** The rows loaded so far under the current filter. */
  transactions: readonly Transaction[];
  selectedTxn: Transaction | null;
  properties: readonly Property[];
  onSelectTxn: (txn: Transaction) => void;
  onClearTxn: () => void;
  onTxnDeleted: () => void;
  /** Lets the drill-down close the detail view through its unsaved-edits prompt. */
  transactionPanelRef: Ref<TransactionPanelHandle>;
}

/** The open transaction's detail, or the paged list with its load error above it. */
export default function DrillDownPanelBody({
  listMode,
  pages,
  transactions,
  selectedTxn,
  properties,
  onSelectTxn,
  onClearTxn,
  onTxnDeleted,
  transactionPanelRef,
}: DrillDownPanelBodyProps) {
  const { showSuccess } = useToast();

  if (selectedTxn) {
    return (
      <TransactionPanel
        key={selectedTxn.id}
        ref={transactionPanelRef}
        transaction={selectedTxn}
        properties={properties}
        onClose={onClearTxn}
        onVendorLearned={(vendor, category, count) => {
          const formatted = category.replace(/_/g, " ");
          if (count > 0) {
            showSuccess(
              `Got it! I'll categorize future transactions from ${vendor} as ${formatted}. Also updated ${count} other transaction${count === 1 ? "" : "s"}.`,
            );
          } else {
            showSuccess(
              `Got it! I'll categorize future transactions from ${vendor} as ${formatted}.`,
            );
          }
        }}
        onDeleted={onTxnDeleted}
        embedded
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <DrillDownErrorState pages={pages} />
      <DrillDownListContent
        mode={listMode}
        transactions={transactions}
        hasNextPage={pages.hasNextPage}
        isFetchingNextPage={pages.isFetchingNextPage}
        onLoadMore={pages.loadMore}
        onSelectTxn={onSelectTxn}
      />
    </div>
  );
}
