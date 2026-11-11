import type { SharingOptions } from "expo-sharing";

export interface ShareDownloadOptions {
  /** Sent with the download, never in the URL, e.g. the sign-in. */
  headers?: Record<string, string>;
  /** What the share sheet is told the file is. */
  share: SharingOptions;
}
