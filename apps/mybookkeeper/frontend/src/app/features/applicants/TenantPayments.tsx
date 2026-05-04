import { useState } from "react";
import { DollarSign, FileText } from "lucide-react";
import Skeleton from "@/shared/components/ui/Skeleton";
import { formatCurrency } from "@/shared/utils/currency";
import { useListTransactionsQuery } from "@/shared/store/transactionsApi";
import DocumentViewer from "@/app/features/documents/DocumentViewer";

interface Props {
  applicantId: string;
}

export default function TenantPayments({ applicantId }: Props) {
  const { data: transactions = [], isLoading } = useListTransactionsQuery(
    { applicant_id: applicantId, transaction_type: "income" },
    { skip: !applicantId },
  );
  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);

  const total = transactions.reduce(
    (sum, txn) => sum + parseFloat(txn.amount),
    0,
  );

  if (isLoading) {
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

  if (transactions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No attributed payments yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-green-600" aria-hidden="true" />
        <span className="text-sm font-medium text-green-600">
          Total received: {formatCurrency(total)}
        </span>
      </div>
      <ul className="divide-y text-sm" data-testid="tenant-payments-list">
        {transactions.map((txn) => {
          const docId = txn.source_document_id;
          return (
            <li key={txn.id} className="flex items-center justify-between py-2 gap-3">
              <div className="min-w-0 flex items-center gap-2">
                {docId ? (
                  <button
                    type="button"
                    onClick={() => setViewingDocumentId(docId)}
                    className="text-muted-foreground hover:text-primary shrink-0"
                    title="Open source document"
                    aria-label="Open source document"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <p className="truncate">{txn.payer_name ?? txn.vendor ?? "Payment"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(txn.transaction_date).toLocaleDateString()}
                    {txn.attribution_source === "manual" && (
                      <span className="ml-1 text-muted-foreground">(manual)</span>
                    )}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-medium text-green-600">
                {formatCurrency(parseFloat(txn.amount))}
              </span>
            </li>
          );
        })}
      </ul>
      {viewingDocumentId ? (
        <DocumentViewer
          documentId={viewingDocumentId}
          onClose={() => setViewingDocumentId(null)}
        />
      ) : null}
    </div>
  );
}
