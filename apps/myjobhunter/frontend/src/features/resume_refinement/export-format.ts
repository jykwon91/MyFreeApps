/**
 * Download formats for the completed resume. Values match the backend
 * export endpoint's ``format`` query param
 * (GET /resume-refinement/sessions/{id}/export?format=…).
 */
export const ExportFormat = {
  PDF: "pdf",
  DOCX: "docx",
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];
