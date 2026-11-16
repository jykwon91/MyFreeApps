import type { ResumeJobParsedFields } from "../types/resume-upload-job/resume-job-parsed-fields";
import type { ResumeParsedCount } from "../types/resume-upload-job/resume-parsed-count";

/** How many roles, education entries and skills a parse read, each with its noun. */
export function resumeParsedCounts(parsed: Pick<ResumeJobParsedFields, "work_history_count" | "education_count" | "skills_count">): ResumeParsedCount[] {
  return [
    { count: parsed.work_history_count, label: parsed.work_history_count === 1 ? "role" : "roles" },
    { count: parsed.education_count, label: parsed.education_count === 1 ? "education" : "education entries" },
    { count: parsed.skills_count, label: parsed.skills_count === 1 ? "skill" : "skills" },
  ];
}
