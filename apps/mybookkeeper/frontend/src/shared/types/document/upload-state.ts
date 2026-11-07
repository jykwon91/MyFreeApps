import type { FileStatus } from "./file-status";

export interface UploadState {
  fileName: string;
  status: FileStatus;
  documentId: string | null;
  batchId: string | null;
  batchTotal: number;
  multiUploadTotal: number;
  multiUploadCompleted: number;
  multiUploadFailed: number;
}
