import type { AttachmentViewMode } from "@/shared/types/lease/attachment-view-mode";

interface UseAttachmentViewModeArgs {
  url: string;
  contentType: string;
}

/**
 * Resolves the viewer's render mode from the URL + content type.
 * Single source of truth so the body component is a flat switch instead of
 * a tower of conditionals.
 *
 * When the URL is empty, the viewer renders the "unavailable" body
 * regardless of content type — the underlying object is missing from
 * storage and there's nothing to load into an iframe / img tag.
 */
export function useAttachmentViewMode({
  url,
  contentType,
}: UseAttachmentViewModeArgs): AttachmentViewMode {
  if (!url) return "unavailable";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return "other";
}
