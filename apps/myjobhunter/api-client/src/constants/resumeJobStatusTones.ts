import type { ResumeUploadJobStatus } from "../types/resume-upload-job/resume-upload-job-status";
import type { StatusTone } from "../types/status-tone";

/** The tone of each upload status's badge: a failed read stands out, one still being read is in progress. */
export const RESUME_JOB_STATUS_TONES: Record<ResumeUploadJobStatus, StatusTone> = {
  queued: "neutral",
  processing: "info",
  complete: "success",
  failed: "danger",
  cancelled: "neutral",
};
