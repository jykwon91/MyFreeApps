import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useToast } from "@/shared/hooks/useToast";
import { formatCurrency } from "@/shared/utils/currency";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";
import type { Transaction } from "@/shared/types/transaction/transaction";
import { useDrillDownBodyMode } from "./useDrillDownBodyMode";
import DrillDownPanelBody from "./DrillDownPanelBody";

export interface DrillDownPanelProps {
  filter: DrillDownFilter;
  onClose: () => void;
}

export default function DrillDownPanel({ filter, onClose }: DrillDownPanelProps) {
  const { showSuccess } = useToast();
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const { data: allTransactions = [], isLoading } = useListTransactionsQuery({
    category: filter.category,
    property_id: filter.propertyId,
    start_date: filter.startDate,
    end_date: filter.endDate,
    status: "approved",
  });

  const { data: properties = [] } = useGetPropertiesQuery();

  const transactions = useMemo(() => {
    let filtered = allTransactions;
    if (filter.type) {
      const txnType = filter.type === "revenue" ? "income" : "expense";
      filtered = filtered.filter((txn) => txn.transaction_type === txnType);
    }
    if (filter.propertyIds?.length) {
      const ids = new Set(filter.propertyIds);
      filtered = filtered.filter((txn) => txn.property_id !== null && ids.has(txn.property_id));
    }
    return filtered;
  }, [allTransactions, filter.type, filter.propertyIds]);

  const total = transactions.reduce((sum, txn) => {
    const amt = typeof txn.amount === "string" ? parseFloat(txn.amount) || 0 : txn.amount;
    return sum + amt;
  }, 0);

  const mode = useDrillDownBodyMode({
    selectedTxn,
    isLoading,
    transactionCount: transactions.length,
  });

  return (
    <Panel position="right" width="520px" onClose={onClose}>
      {/* Breadcrumb header */}
      <header className="flex items-center gap-3 px-5 py-4 border-b">
        <button
          onClick={selectedTxn ? () => setSelectedTxn(null) : onClose}
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
              <span className="font-medium truncate">{selectedTxn.vendor ?? "Transaction"}</span>
            </nav>
          ) : (
            <>
              <p className="font-medium">{filter.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} — {formatCurrency(total)}
              </p>
            </>
          )}
        </div>
        <PanelCloseButton onClose={onClose} />
      </header>

      {/* Content: dispatched to sub-components via mode */}
      <DrillDownPanelBody
        mode={mode}
        transactions={transactions}
        selectedTxn={selectedTxn}
        properties={properties}
        onSelectTxn={setSelectedTxn}
        onClearTxn={() => setSelectedTxn(null)}
        onTxnDeleted={() => {
          setSelectedTxn(null);
          showSuccess("Transaction deleted");
        }}
      />
    </Panel>
  );
}
