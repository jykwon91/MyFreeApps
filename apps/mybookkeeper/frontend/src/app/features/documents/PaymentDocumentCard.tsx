import { DollarSign } from "lucide-react";
import type { Transaction } from "@/shared/types/transaction/transaction";
import { formatCurrency } from "@/shared/utils/currency";

interface Props {
  transaction: Transaction;
}

const PAYMENT_VENDOR_PATTERNS = [
  "zelle",
  "venmo",
  "cash app",
  "cashapp",
  "paypal",
  "apple pay",
  "google pay",
  "airbnb",
  "vrbo",
];

export function isPaymentTransaction(txn: Transaction): boolean {
  if (txn.transaction_type !== "income") return false;
  if (txn.amount === null || parseFloat(txn.amount) <= 0) return false;
  const vendor = (txn.vendor ?? "").toLowerCase();
  if (!vendor) return false;
  return PAYMENT_VENDOR_PATTERNS.some((p) => vendor.includes(p));
}

export default function PaymentDocumentCard({ transaction }: Props) {
  const amount = parseFloat(transaction.amount);
  const date = new Date(transaction.transaction_date);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium truncate">
            {transaction.vendor ?? "Payment"}
          </span>
        </div>
        <span className="text-base font-semibold text-green-600 shrink-0">
          {formatCurrency(amount)}
        </span>
      </div>
      <dl className="px-4 py-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {transaction.payer_name ? (
          <>
            <dt className="text-muted-foreground">Payer</dt>
            <dd className="font-medium truncate">{transaction.payer_name}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Date</dt>
        <dd>{date.toLocaleDateString()}</dd>
        {transaction.payment_method ? (
          <>
            <dt className="text-muted-foreground">Method</dt>
            <dd className="capitalize">
              {transaction.payment_method.replace(/_/g, " ")}
            </dd>
          </>
        ) : null}
        {transaction.description ? (
          <>
            <dt className="text-muted-foreground">Memo</dt>
            <dd className="truncate">{transaction.description}</dd>
          </>
        ) : null}
        {transaction.address ? (
          <>
            <dt className="text-muted-foreground">Property</dt>
            <dd className="truncate">{transaction.address}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
