import type { DocumentKind } from "@/types/document/document-kind";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  cover_letter: "Cover Letter",
  tailored_resume: "Tailored Resume",
  job_description: "Job Description",
  portfolio: "Portfolio",
  other: "Other",
};

export const DOCUMENT_KIND_OPTIONS: { value: DocumentKind; label: string }[] =
  (Object.entries(DOCUMENT_KIND_LABELS) as [DocumentKind, string][]).map(
    ([value, label]) => ({ value, label }),
  );
