import type { ResumeUploadJobStatus } from "../types/resume-upload-job/resume-upload-job-status";

/** What each upload status is called on its badge. */
export const RESUME_JOB_STATUS_LABELS: Record<ResumeUploadJobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};
