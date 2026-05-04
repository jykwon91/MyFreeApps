import { useEffect, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { fetchDocumentBlob, type DocumentBlob } from "@/shared/services/documentService";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import type { Transaction } from "@/shared/types/transaction/transaction";
import PaymentDocumentCard, { isPaymentTransaction } from "./PaymentDocumentCard";

interface Props {
  documentId: string;
  onClose: () => void;
  /**
   * When provided AND the transaction looks like a P2P / platform payment
   * (Zelle, Venmo, Cash App, PayPal, Airbnb payout, etc.), the viewer
   * renders a structured card with the extracted fields instead of
   * dumping the raw forwarded email body. The original email is still
   * accessible via the "Show original email" disclosure.
   */
  transaction?: Transaction;
}

export default function DocumentViewer({ documentId, onClose, transaction }: Props) {
  const [blob, setBlob] = useState<DocumentBlob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const renderAsPayment = transaction !== undefined && isPaymentTransaction(transaction);

  useEffect(() => {
    // For payment transactions we lazy-load the blob — only fetch when the
    // user clicks "Show original email". Saves a network round-trip on the
    // common path where the structured card is enough.
    if (renderAsPayment && !showSource) return;
    let revoked = false;
    fetchDocumentBlob(documentId)
      .then((result) => { if (!revoked) setBlob(result); })
      .catch((e: Error) => { if (!revoked) setError(e.message); });
    return () => {
      revoked = true;
      setBlob((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [documentId, renderAsPayment, showSource]);

  const isImage = blob?.contentType.startsWith("image/");
  const isPdf = blob?.contentType === "application/pdf";
  const isEmpty = blob !== null && blob.size === 0;

  return (
    <Panel position="center" onClose={onClose}>
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-muted-foreground">Source document</span>
          {blob && !isEmpty ? (
            <a
              href={blob.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              data-testid="document-open-in-new-tab"
            >
              <ExternalLink size={12} />
              Open in new tab
            </a>
          ) : null}
        </div>
        <PanelCloseButton onClose={onClose} label="Close viewer" />
      </header>

      <div className="flex-1 min-h-0 overflow-auto bg-muted/50">
        {renderAsPayment && transaction ? (
          <div className="p-6 space-y-4">
            <PaymentDocumentCard transaction={transaction} />
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showSource ? "Hide original email" : "Show original email"}
            </button>
            {showSource ? (
              <div className="border rounded-md bg-card overflow-hidden">
                {blob && !isEmpty ? (
                  <iframe src={blob.url} className="w-full h-[40vh]" title="Original email" />
                ) : blob && isEmpty ? (
                  <p className="p-3 text-xs text-muted-foreground italic">
                    The original email is no longer available.
                  </p>
                ) : (
                  <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Loading source...
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : error ? (
          <p className="flex items-center justify-center h-full text-sm text-destructive px-4 text-center" data-testid="document-error">
            {error}
          </p>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center" data-testid="document-empty">
            <p className="text-sm text-destructive">This document has no content available.</p>
            <p className="text-xs text-muted-foreground">
              The file may have been removed from storage. Try re-uploading the document.
            </p>
          </div>
        ) : blob ? (
          isImage ? (
            <div className="flex items-center justify-center h-full p-4">
              <img
                src={blob.url}
                alt="Source document"
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              />
            </div>
          ) : isPdf ? (
            <div className="h-full bg-white rounded-b-lg">
              <iframe src={blob.url} className="w-full h-full" title="Source document" />
            </div>
          ) : (
            <iframe src={blob.url} className="w-full h-full rounded-b-lg" title="Source document" />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm">Loading document...</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
