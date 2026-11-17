import { FILE_DOWNLOAD_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { ShareDownloadOptions } from "../types/ShareDownloadOptions";
import { DownloadFailure } from "./DownloadFailure";
import { downloadFailureFrom } from "./downloadFailureFrom";

/**
 * Downloads to `destination`, opens the system's share sheet or viewer on it, and removes the
 * copy afterwards, whether or not that worked. The caller owns the folder `destination` is in,
 * and clears it at launch in case the app was killed while a copy was open.
 *
 * The download skips the API client, so it carries its own limit: past FILE_DOWNLOAD_TIMEOUT_MS
 * it is cancelled. Any download that doesn't finish throws a DownloadFailure saying why.
 */
export async function shareDownloadedFile(url: string, destination: File, { headers, share }: ShareDownloadOptions): Promise<void> {
  try {
    await download(url, destination, headers);
    await Sharing.shareAsync(destination.uri, share);
  } finally {
    if (destination.exists) destination.delete();
  }
}

async function download(url: string, destination: File, headers: Record<string, string> | undefined): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FILE_DOWNLOAD_TIMEOUT_MS);
  try {
    await File.downloadFileAsync(url, destination, { headers, idempotent: true, signal: controller.signal });
  } catch (error) {
    throw timedOut ? new DownloadFailure("timeout", "The download timed out") : downloadFailureFrom(error);
  } finally {
    clearTimeout(timer);
  }
}
