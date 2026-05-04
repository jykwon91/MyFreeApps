import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DocumentViewTarget } from "@/shared/types/document/document-view-target";
import { formatCurrency } from "@/shared/utils/currency";
import OpenSourceButton from "./OpenSourceButton";

export interface PaymentRowProps {
  transaction: Transaction;
  onOpenDocument: (target: DocumentViewTarget) => void;
}

export default function PaymentRow({ transaction, onOpenDocument }: PaymentRowProps) {
  const docId = transaction.source_document_id;
  const label = transaction.payer_name ?? transaction.vendor ?? "Payment";
  const dateLabel = new Date(transaction.transaction_date).toLocaleDateString();
  const isManual = transaction.attribution_source === "manual";

  return (
    <li className="flex items-center justify-between py-2 gap-3">
      <div className="min-w-0 flex items-center gap-2">
        {docId ? (
          <OpenSourceButton
            onClick={() =>
              onOpenDocument({ documentId: docId, transactionId: transaction.id })
            }
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate">{label}</p>
          <p className="text-xs text-muted-foreground">
            {dateLabel}
            {isManual ? <span className="ml-1 text-muted-foreground">(manual)</span> : null}
          </p>
        </div>
      </div>
      <span className="shrink-0 font-medium text-green-600">
        {formatCurrency(parseFloat(transaction.amount))}
      </span>
    </li>
  );
}
