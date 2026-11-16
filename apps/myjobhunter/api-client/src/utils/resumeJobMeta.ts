import { formatFileSize } from "@platform/core/utils/fileSize";
import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";
import { formatDateTime } from "./formatDateTime";

/** When an upload came in and how big the file is, e.g. "Oct 20, 2026, 9:30 AM · 1.5 KB". */
export function resumeJobMeta(job: Pick<ResumeUploadJob, "created_at" | "file_size_bytes">): string {
  // 0 bytes is a real size, so only an unknown size is left out.
  const size = job.file_size_bytes !== null ? ` · ${formatFileSize(job.file_size_bytes)}` : "";
  return `${formatDateTime(job.created_at)}${size}`;
}
