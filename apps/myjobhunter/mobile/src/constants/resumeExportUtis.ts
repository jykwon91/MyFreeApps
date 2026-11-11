import type { ExportFormat } from "@myjobhunter/api-client/types/resume-refinement/export-format";

/** What iOS calls each download format, so the share sheet offers the right apps. */
export const RESUME_EXPORT_UTIS: Record<ExportFormat, string> = {
  pdf: "com.adobe.pdf",
  docx: "org.openxmlformats.wordprocessingml.document",
};
