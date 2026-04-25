import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useToast } from "@/shared/hooks/useToast";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import type { DrillDownFilter } from "@/shared/types/dashboard/drill-down-filter";
import type { Transaction } from "@/shared/types/transaction/transaction";

interface Props {
  filter: DrillDownFilter;
  onClose: () => void;
}

export default function DrillDownPanel({ filter, onClose }: Props) {
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

      {/* Content: transaction list or edit form */}
      {selectedTxn ? (
        <TransactionPanel
          key={selectedTxn.id}
          transaction={selectedTxn}
          properties={properties}
          onClose={() => setSelectedTxn(null)}
          onVendorLearned={(vendor, category, count) => {
            const formatted = category.replace(/_/g, " ");
            if (count > 0) {
              showSuccess(`Got it! I'll categorize future transactions from ${vendor} as ${formatted}. Also updated ${count} other transaction${count === 1 ? "" : "s"}.`);
            } else {
              showSuccess(`Got it! I'll categorize future transactions from ${vendor} as ${formatted}.`);
            }
          }}
          onDeleted={() => {
            setSelectedTxn(null);
            showSuccess("Transaction deleted");
          }}
          embedded
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No transactions found for this period.</p>
          ) : (
            <ul className="divide-y">
              {transactions.map((txn) => (
                <li
                  key={txn.id}
                  onClick={() => setSelectedTxn(txn)}
                  className="px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{txn.vendor ?? "Unknown vendor"}</p>
                        {txn.source_document_id ? (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatDate(txn.transaction_date)}</span>
                        <span className="text-xs bg-muted rounded px-1.5 py-0.5">{formatTag(txn.category)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold ml-4 shrink-0">{formatCurrency(txn.amount)}</span>
                  </div>
                  {txn.description ? (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{txn.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
