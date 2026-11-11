import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { ShareDownloadOptions } from "../types/ShareDownloadOptions";

/**
 * Downloads to `destination`, opens the system's share sheet or viewer on it, and removes the
 * copy afterwards, whether or not that worked. The caller owns the folder `destination` is in,
 * and clears it at launch in case the app was killed while a copy was open.
 */
export async function shareDownloadedFile(url: string, destination: File, { headers, share }: ShareDownloadOptions): Promise<void> {
  try {
    await File.downloadFileAsync(url, destination, { headers, idempotent: true });
    await Sharing.shareAsync(destination.uri, share);
  } finally {
    if (destination.exists) destination.delete();
  }
}
