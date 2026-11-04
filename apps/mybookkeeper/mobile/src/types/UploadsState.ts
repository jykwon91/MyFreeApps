import type { UploadPhase } from "./UploadPhase";

export interface UploadsState {
  phase: UploadPhase;
  /** Files the server turned down, which won't be tried again. */
  rejections: string[];
}
