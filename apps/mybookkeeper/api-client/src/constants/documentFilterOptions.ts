import type { DocumentFilterOption } from "../types/document/DocumentFilterOption";
import { DOCUMENT_SOURCE_LABELS } from "./documentSourceLabels";
import { DOCUMENT_STATUS_LABELS } from "./documentStatusLabels";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "./documentTypes";

export const DOCUMENT_TYPE_OPTIONS: DocumentFilterOption[] = DOCUMENT_TYPES.map((type) => ({
  value: type,
  label: DOCUMENT_TYPE_LABELS[type] ?? type,
}));

/** "deleted" is left out: a deleted document is never listed. */
export const DOCUMENT_STATUS_OPTIONS: DocumentFilterOption[] = (
  ["completed", "failed", "duplicate", "processing", "extracting", "skipped"] as const
).map((status) => ({ value: status, label: DOCUMENT_STATUS_LABELS[status] }));

export const DOCUMENT_SOURCE_OPTIONS: DocumentFilterOption[] = Object.entries(DOCUMENT_SOURCE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
