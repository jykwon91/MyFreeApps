import type { ExportFormat } from "../types/resume-refinement/export-format";

/** Where the API builds the finished resume as a file, relative to the API's base URL. */
export function resumeExportPath(sessionId: string, format: ExportFormat): string {
  return `/resume-refinement/sessions/${encodeURIComponent(sessionId)}/export?format=${format}`;
}
