import type { Directory } from "expo-file-system";

/**
 * Removes a folder of downloaded copies: at launch, for one left behind when the app was killed
 * while it was open, or after a share. Failing only leaves a cache file the system clears in
 * time, so it's logged, never thrown.
 */
export function clearDownloadCopies(directory: Directory): void {
  try {
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn(`Couldn't clear the copies in ${directory.uri}`, error);
  }
}
