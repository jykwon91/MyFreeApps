import { DOCUMENT_UPLOAD_EXTENSIONS, DOCUMENT_UPLOAD_KINDS_LABEL, DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "../constants/documentUpload";
import type { DocumentUploadProblem } from "../types/document/DocumentUploadProblem";

const SUPPORTED: ReadonlySet<string> = new Set(DOCUMENT_UPLOAD_EXTENSIONS);

/** The extension, lower case and with its dot; empty when there isn't one. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isSupportedDocumentUpload(name: string): boolean {
  return SUPPORTED.has(fileExtension(name));
}

/** Null when the file can be sent. The server turns the same files away, and checks a size the picker didn't know. */
export function documentUploadProblem(name: string, size: number | undefined): DocumentUploadProblem | null {
  if (!isSupportedDocumentUpload(name)) return "unsupported";
  if (size === undefined) return null;
  if (size === 0) return "empty";
  if (size > DOCUMENT_UPLOAD_MAX_BYTES) return "tooBig";
  return null;
}

export function documentUploadProblemMessage(name: string, problem: DocumentUploadProblem): string {
  switch (problem) {
    case "unsupported":
      return `I can't read ${name}. I take ${DOCUMENT_UPLOAD_KINDS_LABEL}.`;
    case "empty":
      return `${name} is empty, so there's nothing for me to read.`;
    case "tooBig":
      return `${name} is over ${DOCUMENT_UPLOAD_MAX_LABEL}, which is more than I can take. Try a smaller file, or split it up.`;
  }
}
