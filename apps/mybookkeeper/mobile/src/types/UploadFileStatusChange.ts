import type { UploadFileStatus } from "./UploadFileStatus";

export interface UploadFileStatusChange {
  uri: string;
  status: UploadFileStatus;
}
