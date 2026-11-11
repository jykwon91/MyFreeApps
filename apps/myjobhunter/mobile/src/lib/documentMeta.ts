import type { Document } from "@myjobhunter/api-client/types/document/document";
import { formatFileSize } from "@platform/core/utils/fileSize";
import { formatShortDate } from "@myjobhunter/api-client/utils/formatShortDate";

/** When it last changed and, for a file, how big it is. */
export function documentMeta(document: Pick<Document, "updated_at" | "size_bytes">): string {
  const size = document.size_bytes ? formatFileSize(document.size_bytes) : "";
  return [formatShortDate(document.updated_at), size].filter(Boolean).join(" · ");
}
