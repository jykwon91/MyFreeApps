import { DOWNLOAD_FAILURE_MESSAGES } from "../constants/downloadFailure";
import { DownloadFailure } from "./DownloadFailure";

/** The words for a failed download: the specific cause when known, else the caller's own `fallback`. */
export function downloadFailureMessage(error: unknown, fallback: string): string {
  if (!(error instanceof DownloadFailure) || error.kind === "other") return fallback;
  return DOWNLOAD_FAILURE_MESSAGES[error.kind];
}
