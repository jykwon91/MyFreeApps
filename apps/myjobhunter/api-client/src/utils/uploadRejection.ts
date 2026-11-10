import { EMPTY_FILE_DETAIL } from "../constants/documentUploadErrors";
import type { DocumentUploadProblem } from "../types/document/document-upload-problem";

/** Which file problem a refused POST /documents/upload means: 413 too large, 415 a bad type or an empty file. */
export function uploadRejection(error: unknown): DocumentUploadProblem | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const detail = "data" in error && typeof error.data === "object" && error.data !== null && "detail" in error.data ? error.data.detail : undefined;
  if (error.status === 413) return "size";
  if (error.status === 415) return detail === EMPTY_FILE_DETAIL ? "empty" : "type";
  return null;
}
