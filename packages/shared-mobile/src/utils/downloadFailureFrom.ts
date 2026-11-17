import type { DownloadFailureKind } from "../types/DownloadFailureKind";
import { DownloadFailure } from "./DownloadFailure";

const STATUS_PATTERN = /\b(?:status:?|HTTP) (\d{3})\b/;
const CONNECTION_PATTERN = /offline|internet|network|connect|resolve host|timed out|timeout|unreachable/i;

function kindOf(message: string): DownloadFailureKind {
  const status = STATUS_PATTERN.exec(message)?.[1];
  if (status === "401") return "signedOut";
  if (status === "404") return "notFound";
  if (status === undefined && CONNECTION_PATTERN.test(message)) return "offline";
  return "other";
}

/** expo-file-system reports a refused download only in its message, e.g. "response has status: 404". */
export function downloadFailureFrom(error: unknown): DownloadFailure {
  const message = error instanceof Error ? error.message : String(error);
  return new DownloadFailure(kindOf(message), message);
}
