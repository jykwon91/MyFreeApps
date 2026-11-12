import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";
import { formatShortDate } from "./formatShortDate";

/** What was read from an uploaded resume and when it came in, e.g. "3 roles, 12 skills · uploaded Oct 20, 2026". */
export function resumeJobSummary(job: Pick<ResumeUploadJob, "result_parsed_fields" | "created_at">): string {
  const fields = job.result_parsed_fields;
  const summary = fields
    ? `${fields.work_history_count} role${fields.work_history_count === 1 ? "" : "s"}, ${fields.skills_count} skills`
    : "Parsed resume";
  return `${summary} · uploaded ${formatShortDate(job.created_at)}`;
}
