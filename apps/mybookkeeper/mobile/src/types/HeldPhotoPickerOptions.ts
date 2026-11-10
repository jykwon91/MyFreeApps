import type { FileForUpload } from "./FileForUpload";

export interface HeldPhotoPickerOptions {
  /** Called with each photo the moment it is ready. */
  onReady: (file: FileForUpload) => void;
  /** The name for the next photo made; asked once per photo. */
  nextName: () => string;
  /** How many the library may hand over at once. 0 means no limit. */
  selectionLimit: number;
  messages: { pickFailed: string; cameraDenied: string };
}
