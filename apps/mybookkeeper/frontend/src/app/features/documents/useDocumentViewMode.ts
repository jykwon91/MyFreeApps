import type { DocumentBlob } from "@/shared/services/documentService";
import type { DocumentViewMode } from "@/shared/types/document/document-view-mode";

interface Args {
  renderAsPayment: boolean;
  error: string | null;
  blob: DocumentBlob | null;
}

/**
 * Resolves the viewer's current render mode from the loaded state.
 * Single source of truth — keeps the body of DocumentViewer free of
 * cascading conditionals.
 */
export function useDocumentViewMode({ renderAsPayment, error, blob }: Args): DocumentViewMode {
  if (renderAsPayment) return "payment";
  if (error !== null) return "error";
  if (blob === null) return "loading";
  if (blob.size === 0) return "empty";
  if (blob.contentType.startsWith("image/")) return "image";
  if (blob.contentType === "application/pdf") return "pdf";
  return "generic";
}
