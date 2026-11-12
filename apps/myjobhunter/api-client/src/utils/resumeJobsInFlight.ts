import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/** The uploads still being read, newest first as the list comes. Their status is worth polling for. */
export function resumeJobsInFlight(jobs: readonly ResumeUploadJob[]): ResumeUploadJob[] {
  return jobs.filter((job) => job.status === "queued" || job.status === "processing");
}
