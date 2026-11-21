import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/** True for an upload waiting to be read again after a temporary failure (the AI service was busy). */
export function isResumeJobRetrying(job: Pick<ResumeUploadJob, "status" | "retry_count">): boolean {
  return job.status === "queued" && job.retry_count > 0;
}
