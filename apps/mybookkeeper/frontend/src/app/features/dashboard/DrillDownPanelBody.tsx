import type { Ref } from "react";
import { useToast } from "@/shared/hooks/useToast";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import DrillDownEmptyState from "./DrillDownEmptyState";
import DrillDownList from "./DrillDownList";
import DrillDownLoadingState from "./DrillDownLoadingState";
import type { TransactionPanelHandle } from "@/shared/types/transaction/transaction-panel-handle";
import type { DrillDownBodyMode } from "@/shared/types/dashboard/drill-down-body-mode";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { Property } from "@mybookkeeper/api-client/types/property/property";

export interface DrillDownPanelBodyProps {
  mode: DrillDownBodyMode;
  transactions: Transaction[];
  selectedTxn: Transaction | null;
  properties: readonly Property[];
  onSelectTxn: (txn: Transaction) => void;
  onClearTxn: () => void;
  onTxnDeleted: () => void;
  /** Lets the drill-down close the detail view through its unsaved-edits prompt. */
  transactionPanelRef: Ref<TransactionPanelHandle>;
}

export default function DrillDownPanelBody({
  mode,
  transactions,
  selectedTxn,
  properties,
  onSelectTxn,
  onClearTxn,
  onTxnDeleted,
  transactionPanelRef,
}: DrillDownPanelBodyProps) {
  const { showSuccess } = useToast();

  switch (mode) {
    case "detail":
      return (
        <TransactionPanel
          key={selectedTxn!.id}
          ref={transactionPanelRef}
          transaction={selectedTxn!}
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
    case "loading":
      return <DrillDownLoadingState />;
    case "empty":
      return <DrillDownEmptyState />;
    case "list":
      return (
        <div className="flex-1 overflow-y-auto">
          <DrillDownList transactions={transactions} onSelectTxn={onSelectTxn} />
        </div>
      );
  }
}
