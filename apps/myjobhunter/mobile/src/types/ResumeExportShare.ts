import type { ExportFormat } from "@myjobhunter/api-client/types/resume-refinement/export-format";

/** Downloading the finished resume to the share sheet, one format at a time. */
export interface ResumeExportShare {
  downloading: ExportFormat | null;
  download: (format: ExportFormat) => Promise<void>;
}
