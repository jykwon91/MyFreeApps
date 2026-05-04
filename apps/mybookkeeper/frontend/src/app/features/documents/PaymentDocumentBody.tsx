import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DocumentBlob } from "@/shared/services/documentService";
import PaymentDocumentCard from "./PaymentDocumentCard";
import SourceEmailFrame from "./SourceEmailFrame";

export interface PaymentDocumentBodyProps {
  transaction: Transaction;
  blob: DocumentBlob | null;
  showSource: boolean;
  onToggleSource: () => void;
}

export default function PaymentDocumentBody({
  transaction,
  blob,
  showSource,
  onToggleSource,
}: PaymentDocumentBodyProps) {
  return (
    <div className="p-6 space-y-4">
      <PaymentDocumentCard transaction={transaction} />
      <button
        type="button"
        onClick={onToggleSource}
        className="text-xs text-primary hover:underline"
      >
        {showSource ? "Hide original email" : "Show original email"}
      </button>
      {showSource ? <SourceEmailFrame blob={blob} /> : null}
    </div>
  );
}
