import { UPLOAD_OUTCOMES } from "./upload-outcome";

export const FILE_STATUSES = {
  UPLOADING: "uploading",
  PROCESSING: "processing",
  ERROR: "error",
  ...UPLOAD_OUTCOMES,
} as const;

export type FileStatus = (typeof FILE_STATUSES)[keyof typeof FILE_STATUSES];
