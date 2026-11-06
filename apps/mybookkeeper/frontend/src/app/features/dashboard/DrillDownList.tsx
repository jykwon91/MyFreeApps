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
