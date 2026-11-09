import type { FileForUpload } from "./FileForUpload";
import type { ListingPhotoUploadStatus } from "./ListingPhotoUploadStatus";

/** One photo on its way to a listing. A failed one keeps its file, so Try again has something to send. */
export interface ListingPhotoUpload {
  key: string;
  file: FileForUpload;
  status: ListingPhotoUploadStatus;
  /** Why it failed, in words for the person. */
  problem: string | null;
}
