// "skipped": read, but nothing to record (a payment confirmation). "duplicate"
// becomes "deleted" in the same step: a transaction already holds what it says.
export type DocumentStatus =
  | "processing"
  | "extracting"
  | "completed"
  | "failed"
  | "duplicate"
  | "skipped"
  | "deleted";
