import { DOCUMENT_TYPE_LABELS } from "@mybookkeeper/api-client/constants/documentTypes";
import type { Document } from "@mybookkeeper/api-client/types/document/document";

export function isBeingRead(document: Document): boolean {
  return document.status === "processing" || document.status === "extracting";
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

/** The sentence for a document that isn't simply done. Null when there's nothing to say. */
export function documentStatusLine(document: Document): string | null {
  if (isBeingRead(document)) return "Hmm, let me take a look at this…";
  if (document.status === "failed") return "I had trouble reading this one.";
  if (document.status === "duplicate") return "Looks like one I've already read.";
  return null;
}

export function documentStatusLabel(document: Document): string {
  if (isBeingRead(document)) return "Reading";
  if (document.status === "failed") return "Couldn't read";
  if (document.status === "duplicate") return "Duplicate";
  return "Read";
}
