import type { ExportFormat } from "../types/resume-refinement/export-format";

/** The content type of each download format. */
export const RESUME_EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
