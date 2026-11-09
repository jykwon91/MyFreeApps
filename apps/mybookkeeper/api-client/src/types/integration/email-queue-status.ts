export type EmailQueueStatus =
  | "pending"
  | "fetched"
  | "extracting"
  | "done"
  | "skipped"
  | "failed";
