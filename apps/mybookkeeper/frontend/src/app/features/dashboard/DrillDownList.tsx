import { FileText } from "lucide-react";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatTag } from "@/shared/utils/tag";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";

export interface DrillDownListProps {
  transactions: Transaction[];
  onSelectTxn: (txn: Transaction) => void;
}

export default function DrillDownList({ transactions, onSelectTxn }: DrillDownListProps) {
  return (
    <ul className="divide-y">
      {transactions.map((txn) => (
        <li key={txn.id}>
          <button
            type="button"
            onClick={() => onSelectTxn(txn)}
            className="block w-full text-left px-5 py-3 cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring transition-colors"
          >
            <span className="flex items-center justify-between">
              <span className="block min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="block text-sm font-medium truncate">{txn.vendor ?? "Unknown vendor"}</span>
                  {txn.source_document_id ? (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : null}
                </span>
                <span className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatDate(txn.transaction_date)}</span>
                  <span className="text-xs bg-muted rounded px-1.5 py-0.5">{formatTag(txn.category)}</span>
                </span>
              </span>
              <span className="text-sm font-semibold ml-4 shrink-0">{formatCurrency(txn.amount)}</span>
            </span>
            {txn.description ? (
              <span className="block text-xs text-muted-foreground mt-1 truncate">{txn.description}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
