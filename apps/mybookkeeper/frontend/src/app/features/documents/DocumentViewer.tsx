import { useEffect, useState } from "react";
import { fetchDocumentBlob, type DocumentBlob } from "@/shared/services/documentService";
import Panel from "@/shared/components/ui/Panel";
import type { Transaction } from "@/shared/types/transaction/transaction";
import { isPaymentTransaction } from "./PaymentDocumentCard";
import DocumentViewerHeader from "./DocumentViewerHeader";
import DocumentViewerBody from "./DocumentViewerBody";
import { useDocumentViewMode } from "./useDocumentViewMode";

export interface DocumentViewerProps {
  documentId: string;
  onClose: () => void;
  /**
   * When provided AND the transaction looks like a P2P / platform payment,
   * the viewer renders a structured card with the extracted fields. The
   * original email is accessible via "Show original email".
   */
  transaction?: Transaction;
}

export default function DocumentViewer({
  documentId,
  onClose,
  transaction,
}: DocumentViewerProps) {
  const [blob, setBlob] = useState<DocumentBlob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const renderAsPayment = transaction !== undefined && isPaymentTransaction(transaction);

  useEffect(() => {
    // Payment view lazy-loads the blob — only when the user expands the
    // "Show original email" disclosure. Saves a network round-trip when
    // the structured card is sufficient.
    if (renderAsPayment && !showSource) return;

    let revoked = false;
    fetchDocumentBlob(documentId)
      .then((result) => {
        if (!revoked) setBlob(result);
      })
      .catch((e: Error) => {
        if (!revoked) setError(e.message);
      });

    return () => {
      revoked = true;
      setBlob((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [documentId, renderAsPayment, showSource]);

  const mode = useDocumentViewMode({ renderAsPayment, error, blob });

  return (
    <Panel position="center" onClose={onClose}>
      <DocumentViewerHeader blob={blob} mode={mode} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-auto bg-background">
        <DocumentViewerBody
          mode={mode}
          blob={blob}
          error={error}
          transaction={transaction}
          showSource={showSource}
          onToggleSource={() => setShowSource((v) => !v)}
        />
      </div>
    </Panel>
  );
}
