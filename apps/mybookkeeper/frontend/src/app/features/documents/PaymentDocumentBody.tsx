import { Loader2 } from "lucide-react";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { DocumentBlob } from "@/shared/services/documentService";
import PaymentDocumentCard from "./PaymentDocumentCard";

interface Props {
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
}: Props) {
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
      {showSource ? (
        <SourceEmailFrame blob={blob} />
      ) : null}
    </div>
  );
}

interface SourceEmailFrameProps {
  blob: DocumentBlob | null;
}

function SourceEmailFrame({ blob }: SourceEmailFrameProps) {
  if (blob === null) {
    return (
      <div className="border rounded-md bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading source...
        </div>
      </div>
    );
  }

  if (blob.size === 0) {
    return (
      <div className="border rounded-md bg-card overflow-hidden">
        <p className="p-3 text-xs text-muted-foreground italic">
          The original email is no longer available.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <iframe src={blob.url} className="w-full h-[40vh]" title="Original email" />
    </div>
  );
}
