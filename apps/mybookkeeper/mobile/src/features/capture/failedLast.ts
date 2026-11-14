import type { PendingUpload } from "../../types/PendingUpload";

/** Keeps oldest first, but files that failed in an earlier drain go behind the ones that haven't. */
export function failedLast(uploads: PendingUpload[], failedEarlier: ReadonlySet<string>): PendingUpload[] {
  return [
    ...uploads.filter((upload) => !failedEarlier.has(upload.uri)),
    ...uploads.filter((upload) => failedEarlier.has(upload.uri)),
  ];
}
