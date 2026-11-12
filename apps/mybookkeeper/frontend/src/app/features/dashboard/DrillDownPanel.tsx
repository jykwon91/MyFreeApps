import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { drillDownListParams, drillDownTotal, filterDrillDownTransactions, isDrillDownTruncated } from "@mybookkeeper/api-client/utils/drillDown";
import { useToast } from "@/shared/hooks/useToast";
import { formatCurrency } from "@/shared/utils/currency";
import { Panel, PanelCloseButton, PanelTitle } from "@platform/ui";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { DRILL_DOWN_TRUNCATED_MESSAGE } from "@mybookkeeper/api-client/constants/transactionPaging";
import { useDrillDownBodyMode } from "./useDrillDownBodyMode";
import { useDrillDownPaging } from "./useDrillDownPaging";
import DrillDownPanelBody from "./DrillDownPanelBody";
import type { TransactionPanelHandle } from "@/shared/types/transaction/transaction-panel-handle";

export interface DrillDownPanelProps {
  filter: DrillDownFilter;
  onClose: () => void;
}

export default function DrillDownPanel({ filter, onClose }: DrillDownPanelProps) {
  const { showSuccess } = useToast();
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const transactionPanelRef = useRef<TransactionPanelHandle>(null);

  const { data: allTransactions = [], isLoading } = useListTransactionsQuery(drillDownListParams(filter));

  const { data: properties = [] } = useGetPropertiesQuery();

  const transactions = useMemo(
    () => filterDrillDownTransactions(allTransactions, filter),
    [allTransactions, filter],
  );

  const paging = useDrillDownPaging(transactions, JSON.stringify(filter));

  const total = drillDownTotal(transactions);
  const truncated = isDrillDownTruncated(allTransactions);

  const mode = useDrillDownBodyMode({
    selectedTxn,
    isLoading,
    transactionCount: transactions.length,
  });

  // Leaving the detail view goes through the transaction's unsaved-edits prompt.
  function leaveDetail(afterLeave: () => void) {
    const panel = transactionPanelRef.current;
    if (selectedTxn && panel) panel.requestClose(afterLeave);
    else afterLeave();
  }

  const close = () => leaveDetail(onClose);

  return (
    <Panel position="right" width="520px" onClose={close}>
      {/* Breadcrumb header */}
      <header className="flex items-center gap-3 px-5 py-4 border-b">
        <button
          onClick={selectedTxn ? () => leaveDetail(() => setSelectedTxn(null)) : onClose}
          className="p-1.5 -ml-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          title={selectedTxn ? "Back to list" : "Back to dashboard"}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          {selectedTxn ? (
            <nav className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground truncate">{filter.label}</span>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              <PanelTitle asChild>
                <span className="font-medium truncate">{selectedTxn.vendor ?? "Transaction"}</span>
              </PanelTitle>
            </nav>
          ) : (
            <>
              <PanelTitle asChild>
                <p className="font-medium">{filter.label}</p>
              </PanelTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} — {formatCurrency(total)}
              </p>
            </>
          )}
        </div>
        <PanelCloseButton onClose={close} />
      </header>

      {truncated && !selectedTxn ? (
        <p role="status" className="px-5 py-2 text-xs bg-muted text-muted-foreground border-b">
          {DRILL_DOWN_TRUNCATED_MESSAGE}
        </p>
      ) : null}

      {/* Content: dispatched to sub-components via mode */}
      <DrillDownPanelBody
        mode={mode}
        transactions={paging.visible}
        remaining={paging.remaining}
        onShowMore={paging.showMore}
        selectedTxn={selectedTxn}
        properties={properties}
        onSelectTxn={setSelectedTxn}
        onClearTxn={() => setSelectedTxn(null)}
        transactionPanelRef={transactionPanelRef}
        onTxnDeleted={() => {
          setSelectedTxn(null);
          showSuccess("Transaction deleted");
        }}
      />
    </Panel>
  );
}
