import type { DocumentBlob } from "@/shared/services/documentService";
import type { DocumentViewMode } from "@/shared/types/document/document-view-mode";
import type { Transaction } from "@/shared/types/transaction/transaction";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import GenericBlobBody from "./GenericBlobBody";
import ImageBody from "./ImageBody";
import LoadingState from "./LoadingState";
import PaymentDocumentBody from "./PaymentDocumentBody";
import PdfBody from "./PdfBody";

export interface DocumentViewerBodyProps {
  mode: DocumentViewMode;
  blob: DocumentBlob | null;
  error: string | null;
  transaction: Transaction | undefined;
  showSource: boolean;
  onToggleSource: () => void;
}

export default function DocumentViewerBody({
  mode,
  blob,
  error,
  transaction,
  showSource,
  onToggleSource,
}: DocumentViewerBodyProps) {
  switch (mode) {
    case "payment":
      // The "payment" mode is only resolved when transaction is defined,
      // see useDocumentViewMode.
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
