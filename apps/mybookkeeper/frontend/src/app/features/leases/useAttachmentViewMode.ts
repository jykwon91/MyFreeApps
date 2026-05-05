import type { AttachmentViewMode } from "@/shared/types/lease/attachment-view-mode";

interface UseAttachmentViewModeArgs {
  contentType: string;
}

/**
 * Resolves the viewer's render mode from the attachment content type.
 * Single source of truth so the body component is a flat switch instead of
 * a tower of conditionals.
 */
export function useAttachmentViewMode({
  contentType,
}: UseAttachmentViewModeArgs): AttachmentViewMode {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  return "other";
}
