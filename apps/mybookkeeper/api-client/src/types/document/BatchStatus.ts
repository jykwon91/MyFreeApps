export const BATCH_STATUSES = {
  PROCESSING: "processing",
  DONE: "done",
} as const;

export type BatchStatus = (typeof BATCH_STATUSES)[keyof typeof BATCH_STATUSES];
