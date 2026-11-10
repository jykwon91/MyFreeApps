import type { DocumentKind } from "../types/document/document-kind";

/** Display label per document kind, in the order they're offered. */
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  cover_letter: "Cover Letter",
  tailored_resume: "Tailored Resume",
  job_description: "Job Description",
  portfolio: "Portfolio",
  other: "Other",
};
