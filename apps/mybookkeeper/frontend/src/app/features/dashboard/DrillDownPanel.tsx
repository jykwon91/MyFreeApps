import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useDrillDownPages } from "@mybookkeeper/api-client/hooks/useDrillDownPages";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { DRILL_DOWN_PROPERTIES_LOAD_ERROR } from "@/shared/lib/drill-down-messages";
import { pagedListView } from "@/shared/lib/paged-list-view";
import { useToast } from "@/shared/hooks/useToast";
import { Panel, PanelCloseButton } from "@platform/ui";
import type { DrillDownFilter } from "@mybookkeeper/api-client/types/analytics/drill-down-filter";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import DrillDownHeaderTitle from "./DrillDownHeaderTitle";
import DrillDownHeadline from "./DrillDownHeadline";
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

  // A page at a time from the server, with the count and total of every matching row. The view
  // never shows another filter's rows, and keeps a failed load's error up through its Retry.
  const pages = useDrillDownPages(filter);
  const { mode: listMode, rows } = pagedListView(pages, pages.transactions);

  const {
    data: properties = [],
    error: propertiesError,
    isFetching: isFetchingProperties,
    refetch: refetchProperties,
  } = useGetPropertiesQuery();

  // Leaving the detail view goes through the transaction's unsaved-edits prompt.
  function leaveDetail(afterLeave: () => void) {
    const panel = transactionPanelRef.current;
    if (selectedTxn && panel) panel.requestClose(afterLeave);
    else afterLeave();
  }

  const close = () => leaveDetail(onClose);

  return (
    <Panel position="right" width="520px" onClose={close}>
      <header className="flex items-center gap-3 px-5 py-4 border-b">
        <button
          onClick={selectedTxn ? () => leaveDetail(() => setSelectedTxn(null)) : onClose}
          className="p-1.5 -ml-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          title={selectedTxn ? "Back to list" : "Back to dashboard"}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <DrillDownHeaderTitle
            label={filter.label}
            selectedTxn={selectedTxn}
            headline={<DrillDownHeadline listMode={listMode} count={pages.total} amountTotal={pages.amountTotal} />}
          />
        </div>
        <PanelCloseButton onClose={close} />
      </header>

      {propertiesError !== undefined && pages.error === undefined ? (
        <div className="px-5 pt-3">
          <LoadErrorAlert
            message={DRILL_DOWN_PROPERTIES_LOAD_ERROR}
            isRetrying={isFetchingProperties}
            onRetry={() => void refetchProperties()}
          />
        </div>
      ) : null}

      <DrillDownPanelBody
        listMode={listMode}
        pages={pages}
        transactions={rows}
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
