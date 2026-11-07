// A single upload ends "done", "failed" or "skipped" (read, but nothing new to add).
export const UPLOAD_OUTCOMES = {
  DONE: "done",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type UploadOutcome = (typeof UPLOAD_OUTCOMES)[keyof typeof UPLOAD_OUTCOMES];
