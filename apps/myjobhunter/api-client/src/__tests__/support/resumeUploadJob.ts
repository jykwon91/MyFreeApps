import type { ResumeUploadJob } from "../../types/resume-upload-job/resume-upload-job";

/** A parsed upload, as GET /resume-upload-jobs lists it. */
export function resumeUploadJob(overrides: Partial<ResumeUploadJob> = {}): ResumeUploadJob {
  return {
    id: "j1",
    profile_id: "p1",
    file_filename: "ada.pdf",
    file_content_type: "application/pdf",
    file_size_bytes: 1000,
    status: "complete",
    error_message: null,
    result_parsed_fields: { summary: null, headline: null, work_history_count: 1, education_count: 0, skills_count: 12 },
    parser_version: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
    ...overrides,
  };
}
