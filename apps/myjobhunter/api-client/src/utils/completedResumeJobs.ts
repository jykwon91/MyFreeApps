import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/** The uploaded resumes that finished parsing, the only ones a refinement session can start from. */
export function completedResumeJobs(jobs: readonly ResumeUploadJob[] | undefined): ResumeUploadJob[] {
  return (jobs ?? []).filter((job) => job.status === "complete");
}
