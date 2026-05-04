import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchDocumentBlob, type DocumentBlob } from "@/shared/services/documentService";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import type { Transaction } from "@/shared/types/transaction/transaction";
import { isPaymentTransaction } from "./PaymentDocumentCard";
import PaymentDocumentBody from "./PaymentDocumentBody";
import {
  EmptyState,
  ErrorState,
  GenericBlobBody,
  ImageBody,
  LoadingState,
  PdfBody,
} from "./DocumentViewerStates";
import { useDocumentViewMode } from "./useDocumentViewMode";

interface Props {
  documentId: string;
  onClose: () => void;
  /**
   * When provided AND the transaction looks like a P2P / platform payment,
   * the viewer renders a structured card with the extracted fields. The
   * original email is accessible via "Show original email".
   */
  transaction?: Transaction;
}

export default function DocumentViewer({ documentId, onClose, transaction }: Props) {
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
      <ViewerHeader blob={blob} mode={mode} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-auto bg-muted/50">
        <ViewerBody
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

interface ViewerHeaderProps {
  blob: DocumentBlob | null;
  mode: ReturnType<typeof useDocumentViewMode>;
  onClose: () => void;
}

function ViewerHeader({ blob, mode, onClose }: ViewerHeaderProps) {
  const showOpenInNewTab = blob !== null && blob.size > 0 && mode !== "payment";
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium text-muted-foreground">Source document</span>
        {showOpenInNewTab ? <OpenInNewTabLink url={blob!.url} /> : null}
      </div>
      <PanelCloseButton onClose={onClose} label="Close viewer" />
    </header>
  );
}

function OpenInNewTabLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      data-testid="document-open-in-new-tab"
    >
      <ExternalLink size={12} />
      Open in new tab
    </a>
  );
}

interface ViewerBodyProps {
  mode: ReturnType<typeof useDocumentViewMode>;
  blob: DocumentBlob | null;
  error: string | null;
  transaction: Transaction | undefined;
  showSource: boolean;
  onToggleSource: () => void;
}

function ViewerBody({
  mode,
  blob,
  error,
  transaction,
  showSource,
  onToggleSource,
}: ViewerBodyProps) {
  switch (mode) {
    case "payment":
      // ``renderAsPayment`` only resolves to "payment" when transaction is
      // defined; the assertion is sound.
      return (
        <PaymentDocumentBody
          transaction={transaction!}
          blob={blob}
          showSource={showSource}
          onToggleSource={onToggleSource}
        />
      );
    case "loading":
      return <LoadingState />;
    case "error":
      return <ErrorState message={error ?? "Unknown error"} />;
    case "empty":
      return <EmptyState />;
    case "image":
      return <ImageBody blob={blob!} />;
    case "pdf":
      return <PdfBody blob={blob!} />;
    case "generic":
      return <GenericBlobBody blob={blob!} />;
  }
}
