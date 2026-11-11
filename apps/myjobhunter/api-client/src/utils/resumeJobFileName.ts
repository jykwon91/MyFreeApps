import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/** The uploaded file's name, or "resume" when the upload kept none. */
export function resumeJobFileName(job: Pick<ResumeUploadJob, "file_filename">): string {
  return job.file_filename ?? "resume";
}
