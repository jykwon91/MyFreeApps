import type { DownloadFailureKind } from "../types/DownloadFailureKind";

/** A download that didn't finish. The message keeps the platform's own words, status included. */
export class DownloadFailure extends Error {
  constructor(
    readonly kind: DownloadFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "DownloadFailure";
  }
}
