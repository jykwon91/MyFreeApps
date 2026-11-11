import type { ExportFormat } from "../types/resume-refinement/export-format";

/** What the downloaded file is called. */
export function resumeExportFileName(format: ExportFormat): string {
  return `resume.${format}`;
}
