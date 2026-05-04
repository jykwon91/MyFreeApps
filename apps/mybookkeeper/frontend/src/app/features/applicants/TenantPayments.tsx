import { useState } from "react";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import type { DocumentViewTarget } from "@/shared/types/document/document-view-target";
import TenantPaymentsSkeleton from "./TenantPaymentsSkeleton";
import TenantPaymentsEmpty from "./TenantPaymentsEmpty";
import TenantPaymentsHeader from "./TenantPaymentsHeader";
import PaymentRow from "./PaymentRow";

export interface TenantPaymentsProps {
  applicantId: string;
}

export default function TenantPayments({ applicantId }: TenantPaymentsProps) {
  const { data: transactions = [], isLoading } = useListTransactionsQuery(
    { applicant_id: applicantId, transaction_type: "income" },
    { skip: !applicantId },
  );
  const [viewing, setViewing] = useState<DocumentViewTarget | null>(null);

  if (isLoading) return <TenantPaymentsSkeleton />;
  if (!transactions.length) return <TenantPaymentsEmpty />;

  const total = transactions.reduce((sum, txn) => sum + parseFloat(txn.amount), 0);
  const viewingTransaction = viewing
    ? transactions.find((t) => t.id === viewing.transactionId)
    : undefined;

  return (
    <div className="space-y-3">
      <TenantPaymentsHeader total={total} />
      <ul className="divide-y text-sm" data-testid="tenant-payments-list">
        {transactions.map((txn) => (
          <PaymentRow key={txn.id} transaction={txn} onOpenDocument={setViewing} />
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
