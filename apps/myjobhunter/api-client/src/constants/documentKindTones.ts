import type { DocumentKind } from "../types/document/document-kind";
import type { StatusTone } from "../types/status-tone";

/** The tone of each document kind's badge. */
export const DOCUMENT_KIND_TONES: Record<DocumentKind, StatusTone> = {
  cover_letter: "info",
  tailored_resume: "success",
  job_description: "warning",
  portfolio: "neutral",
  other: "neutral",
};
