import { DOCUMENT_SOURCE_LABELS } from "../constants/documentSourceLabels";

export function documentSourceLabel(source: string): string {
  return DOCUMENT_SOURCE_LABELS[source] ?? DOCUMENT_SOURCE_LABELS.upload;
}
