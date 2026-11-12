/**
 * What POST /resumes accepts. Mirrors `ALLOWED_RESUME_MIME_TYPES` in
 * apps/myjobhunter/backend/app/services/jobs/resume_validator.py and
 * `settings.max_resume_upload_bytes` in apps/myjobhunter/backend/app/core/config.py.
 */
export const RESUME_UPLOAD_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/** The same types by name, for pickers that go by extension. */
export const RESUME_UPLOAD_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".txt"];

export const RESUME_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
