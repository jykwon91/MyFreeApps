import { useState } from "react";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import { useGetRentLedgerQuery } from "@/shared/store/rentLedgerApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import type { DocumentViewTarget } from "@/shared/types/document/document-view-target";
import type { RentPayment } from "@/shared/types/rent/rent-payment";
import TenantPaymentsSkeleton from "./TenantPaymentsSkeleton";
import TenantPaymentsEmpty from "./TenantPaymentsEmpty";
import TenantPaymentsHeader from "./TenantPaymentsHeader";
import PaymentRow from "./PaymentRow";

export interface TenantPaymentsProps {
  applicantId: string;
}

/**
 * Every payment attributed to this tenant, with its receipt and — for the ones
 * that pay rent — the periods it settled.
 *
 * The rent annotation is read from the ledger rather than recomputed here: a
 * payment's effect depends on every other payment and charge on the account,
 * so the allocation only has one correct home. The list itself stays wider
 * than the ledger's own view, since a deposit is money from this tenant even
 * though it settles no rent.
 */
export default function TenantPayments({ applicantId }: TenantPaymentsProps) {
  const { data: transactions = [], isLoading } = useListTransactionsQuery(
    { applicant_id: applicantId, transaction_type: "income" },
    { skip: !applicantId },
  );
  const { data: ledger } = useGetRentLedgerQuery(
    { applicantId },
    { skip: !applicantId },
  );
  const [viewing, setViewing] = useState<DocumentViewTarget | null>(null);

  if (isLoading) return <TenantPaymentsSkeleton />;
  if (!transactions.length) return <TenantPaymentsEmpty />;

  const total = transactions.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);
  const rentByTransaction = new Map<string, RentPayment>(
    (ledger?.payments ?? []).map((payment) => [payment.transaction_id, payment]),
  );
  const viewingTransaction = viewing
    ? transactions.find((t) => t.id === viewing.transactionId)
    : undefined;

  return (
    <div className="space-y-3">
      <TenantPaymentsHeader total={total} />
      <ul className="divide-y text-sm" data-testid="tenant-payments-list">
        {transactions.map((txn) => (
          <PaymentRow
            key={txn.id}
            transaction={txn}
            rent={rentByTransaction.get(txn.id)}
            onOpenDocument={setViewing}
          />
        ))}
      </ul>
      {viewing ? (
        <DocumentViewer
          documentId={viewing.documentId}
          transaction={viewingTransaction}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
