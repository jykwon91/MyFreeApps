/**
 * The `detail` POST /documents/upload sends with its 415 for a file with no bytes.
 * Mirrors `ResumeRejected("empty file")` in apps/myjobhunter/backend/app/services/jobs/resume_validator.py.
 */
export const EMPTY_FILE_DETAIL = "empty file";
