import { DOCUMENT_TYPE_LABELS } from "@mybookkeeper/api-client/constants/documentTypes";
import { DOCUMENT_STATUS_LABELS } from "@mybookkeeper/api-client/constants/documentStatusLabels";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { documentSourceLabel as sourceLabel } from "@mybookkeeper/api-client/utils/documentSourceLabel";
import { DOCUMENT_LIST_MESSAGES } from "../../constants/documents";

export function isBeingRead(document: Document): boolean {
  return document.status === "processing" || document.status === "extracting";
}

export function isDeleted(document: Document): boolean {
  return document.status === "deleted";
}

/** Whether it can be deleted or marked reference-only: not while it is being read, and not once it is gone. */
export function isActionable(document: Document): boolean {
  return !isBeingRead(document) && !isDeleted(document);
}

export function needsALook(document: Document): boolean {
  return document.status === "failed" || document.status === "duplicate";
}

export function documentName(document: Document): string {
  return document.file_name ?? "Untitled document";
}

export function documentTypeLabel(document: Document): string {
  const type = document.document_type;
  return (type && DOCUMENT_TYPE_LABELS[type]) || "Document";
}

export function documentSourceLabel(document: Document): string {
  return sourceLabel(document.source);
}

/** The sentence for a document that isn't simply done. Null when there's nothing to say. */
export function documentStatusLine(document: Document): string | null {
  if (isBeingRead(document)) return "Hmm, let me take a look at this…";
  if (isDeleted(document)) return DOCUMENT_LIST_MESSAGES.deletedStatusLine;
  if (document.status === "failed") return "I had trouble reading this one.";
  if (document.status === "duplicate") return "Looks like one I've already read.";
  return null;
}

/** The same name the filter sheet uses for the status. */
export function documentStatusLabel(document: Document): string {
  return DOCUMENT_STATUS_LABELS[document.status] ?? DOCUMENT_STATUS_LABELS.completed;
}
