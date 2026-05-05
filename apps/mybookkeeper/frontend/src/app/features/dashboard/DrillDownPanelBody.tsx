import { FileText } from "lucide-react";
import { useToast } from "@/shared/hooks/useToast";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import TransactionPanel from "@/app/features/transactions/TransactionPanel";
import type { DrillDownBodyMode } from "@/shared/types/dashboard/drill-down-body-mode";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { Property } from "@/shared/types/property/property";

export interface DrillDownPanelBodyProps {
  mode: DrillDownBodyMode;
  transactions: Transaction[];
  selectedTxn: Transaction | null;
  properties: readonly Property[];
  onSelectTxn: (txn: Transaction) => void;
  onClearTxn: () => void;
  onTxnDeleted: () => void;
}

function DrillDownLoadingState() {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function DrillDownEmptyState() {
  return (
    <p className="p-5 text-sm text-muted-foreground">
      No transactions found for this period.
    </p>
  );
}

interface DrillDownListProps {
  transactions: Transaction[];
  onSelectTxn: (txn: Transaction) => void;
}

function DrillDownList({ transactions, onSelectTxn }: DrillDownListProps) {
  return (
    <ul className="divide-y">
      {transactions.map((txn) => (
        <li
          key={txn.id}
          onClick={() => onSelectTxn(txn)}
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
  );
}

export default function DrillDownPanelBody({
  mode,
  transactions,
  selectedTxn,
  properties,
  onSelectTxn,
  onClearTxn,
  onTxnDeleted,
}: DrillDownPanelBodyProps) {
  const { showSuccess } = useToast();

  switch (mode) {
    case "detail":
      return (
        <TransactionPanel
          key={selectedTxn!.id}
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
