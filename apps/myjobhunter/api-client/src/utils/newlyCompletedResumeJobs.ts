import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/**
 * The jobs in `next` that finished parsing since `previous` was cached. With nothing cached yet
 * (`previous` undefined) nothing counts as newly finished: whatever reads the profile then loads it fresh.
 */
export function newlyCompletedResumeJobs(
  previous: readonly ResumeUploadJob[] | undefined,
  next: readonly ResumeUploadJob[],
): ResumeUploadJob[] {
  if (previous === undefined) return [];
  const completedBefore = new Set(previous.filter((job) => job.status === "complete").map((job) => job.id));
  return next.filter((job) => job.status === "complete" && !completedBefore.has(job.id));
}
