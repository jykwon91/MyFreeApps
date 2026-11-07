import type { UploadOutcome } from "./upload-outcome";

// A single upload ends "done", "failed" or "skipped" (read, but nothing new to add).
export type FileStatus = "uploading" | "processing" | "error" | UploadOutcome;
