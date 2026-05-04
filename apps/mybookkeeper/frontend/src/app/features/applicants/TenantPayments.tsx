import { useState } from "react";
import { DollarSign, FileText } from "lucide-react";
import Skeleton from "@/shared/components/ui/Skeleton";
import { formatCurrency } from "@/shared/utils/currency";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";
import type { DocumentViewTarget } from "@/shared/types/document/document-view-target";
import type { Transaction } from "@/shared/types/transaction/transaction";

interface Props {
  applicantId: string;
}

export default function TenantPayments({ applicantId }: Props) {
  const { data: transactions = [], isLoading } = useListTransactionsQuery(
    { applicant_id: applicantId, transaction_type: "income" },
    { skip: !applicantId },
  );
  const [viewing, setViewing] = useState<DocumentViewTarget | null>(null);

  if (isLoading) return <PaymentsSkeleton />;
  if (transactions.length === 0) return <PaymentsEmpty />;

  const total = transactions.reduce(
    (sum, txn) => sum + parseFloat(txn.amount),
    0,
  );
  const viewingTransaction =
    viewing === null
      ? undefined
      : transactions.find((t) => t.id === viewing.transactionId);

  return (
    <div className="space-y-3">
      <PaymentsHeader total={total} />
      <ul className="divide-y text-sm" data-testid="tenant-payments-list">
        {transactions.map((txn) => (
          <PaymentRow key={txn.id} transaction={txn} onOpenDocument={setViewing} />
        ))}
      </ul>
      {viewing !== null ? (
        <DocumentViewer
          documentId={viewing.documentId}
          transaction={viewingTransaction}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

function PaymentsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-32" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function PaymentsEmpty() {
  return (
    <p className="text-xs text-muted-foreground italic">No attributed payments yet.</p>
  );
}

interface PaymentsHeaderProps {
  total: number;
}

function PaymentsHeader({ total }: PaymentsHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <DollarSign className="h-4 w-4 text-green-600" aria-hidden="true" />
      <span className="text-sm font-medium text-green-600">
        Total received: {formatCurrency(total)}
      </span>
    </div>
  );
}

interface PaymentRowProps {
  transaction: Transaction;
  onOpenDocument: (target: DocumentViewTarget) => void;
}

function PaymentRow({ transaction, onOpenDocument }: PaymentRowProps) {
  const docId = transaction.source_document_id;
  const label = transaction.payer_name ?? transaction.vendor ?? "Payment";
  const dateLabel = new Date(transaction.transaction_date).toLocaleDateString();
  const isManual = transaction.attribution_source === "manual";

  return (
    <li className="flex items-center justify-between py-2 gap-3">
      <div className="min-w-0 flex items-center gap-2">
        {docId !== null ? (
          <OpenSourceButton
            onClick={() => onOpenDocument({ documentId: docId, transactionId: transaction.id })}
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

interface OpenSourceButtonProps {
  onClick: () => void;
}

function OpenSourceButton({ onClick }: OpenSourceButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-primary shrink-0"
      title="Open source document"
      aria-label="Open source document"
    >
      <FileText className="h-3.5 w-3.5" />
    </button>
  );
}
