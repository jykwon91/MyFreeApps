/**
 * How often the upload list is re-read so a row moves from queued to processing to complete
 * without a refresh. A list endpoint with a sub-1 KB answer.
 */
export const RESUME_JOBS_POLL_INTERVAL_MS = 5000;
