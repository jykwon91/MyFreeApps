import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DocumentViewTarget } from "@/shared/types/document/document-view-target";
import type { RentPayment } from "@/shared/types/rent/rent-payment";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import OpenSourceButton from "./OpenSourceButton";

export interface PaymentRowProps {
  transaction: Transaction;
  /** The rent-ledger view of this payment, when it settled rent. Absent for a
   *  deposit or any other income that does not pay down a rent charge. */
  rent?: RentPayment;
  onOpenDocument: (target: DocumentViewTarget) => void;
}

/** What this payment did, in rent terms. Silence when it isn't rent — a
 *  deposit is held, not earned, and labelling it would be wrong. */
function rentLabel(rent: RentPayment | undefined): string | null {
  if (!rent) return null;
  if (rent.applied_to.length > 0) return `Applied to ${rent.applied_to.join(", ")}`;
  return "Held as credit";
}

export default function PaymentRow({
  transaction,
  rent,
  onOpenDocument,
}: PaymentRowProps) {
  const docId = transaction.source_document_id;
  const label = transaction.payer_name ?? transaction.vendor ?? "Payment";
  // `transaction_date` is a plain YYYY-MM-DD; `new Date()` would read it as UTC
  // midnight and render the day before west of Greenwich — which would put a
  // payment visibly outside the period the line below says it settled.
  const dateLabel = formatDate(transaction.transaction_date);
  const isManual = transaction.attribution_source === "manual";
  const applied = rentLabel(rent);

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
          {applied ? (
            <p
              className="text-xs text-muted-foreground truncate"
              data-testid="payment-row-rent-applied"
            >
              {applied}
            </p>
          ) : null}
        </div>
      </div>
      <span className="shrink-0 font-medium text-green-600">
        {formatCurrency(parseFloat(transaction.amount))}
      </span>
    </li>
  );
}
