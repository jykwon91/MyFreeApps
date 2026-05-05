import type { Document } from "@/types/document/document";

export type DocumentViewMode =
  | "loading"
  | "error"
  | "text-body"
  | "pdf"
  | "download-only";

export interface UseDocumentViewModeArgs {
  doc: Document | null | undefined;
  downloadUrl: string | null | undefined;
  downloadError: boolean;
  downloadLoading: boolean;
}

/**
 * Resolves the document viewer's render mode from the loaded state.
 * Single source of truth so the body component is a flat switch instead
 * of nested ternaries.
 */
export function useDocumentViewMode({
  doc,
  downloadUrl,
  downloadError,
  downloadLoading,
}: UseDocumentViewModeArgs): DocumentViewMode {
  if (!doc) return "loading";
  // Text-only document — render the body directly.
  if (!doc.has_file) return "text-body";
  // File document — need a download URL.
  if (downloadLoading) return "loading";
  if (downloadError) return "error";
  if (!downloadUrl) return "loading";
  // PDF — render in iframe.
  if (doc.content_type === "application/pdf") return "pdf";
  // Non-PDF file — offer a download link.
  return "download-only";
}
