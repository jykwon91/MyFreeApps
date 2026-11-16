import type { ResumeJobParsedFields } from "../types/resume-upload-job/resume-job-parsed-fields";
import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";

/** What was read from an upload, for a finished one that has it; null while it can't be shown. */
export function resumeJobParsedResults(job: Pick<ResumeUploadJob, "status" | "result_parsed_fields">): ResumeJobParsedFields | null {
  return job.status === "complete" ? job.result_parsed_fields : null;
}
