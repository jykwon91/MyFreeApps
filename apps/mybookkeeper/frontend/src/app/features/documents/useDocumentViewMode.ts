import type { DocumentBlob } from "@/shared/services/documentService";
import type { DocumentViewMode } from "@/shared/types/document/document-view-mode";

interface UseDocumentViewModeArgs {
  renderAsPayment: boolean;
  error: string | null;
  blob: DocumentBlob | null;
}

/**
 * Resolves the viewer's render mode from the loaded state. Single source
 * of truth so the body component is a flat switch instead of a tower of
 * conditionals.
 */
export function useDocumentViewMode({
  renderAsPayment,
  error,
  blob,
}: UseDocumentViewModeArgs): DocumentViewMode {
  if (renderAsPayment) return "payment";
  if (error) return "error";
  if (!blob) return "loading";
  // size === 0 is a real signal (file deleted from storage) — distinct from null
  if (blob.size === 0) return "empty";
  if (blob.contentType.startsWith("image/")) return "image";
  if (blob.contentType === "application/pdf") return "pdf";
  return "generic";
}
