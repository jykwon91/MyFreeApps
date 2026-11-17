import { DOWNLOAD_FAILURE_MESSAGES } from "../constants/downloadFailure";
import type { DownloadFailureKind } from "../types/DownloadFailureKind";
import { DownloadFailure } from "../utils/DownloadFailure";
import { downloadFailureMessage } from "../utils/downloadFailureMessage";

describe("downloadFailureMessage", () => {
  it.each(["offline", "timeout", "signedOut", "notFound"] as const)("says what went wrong for %s", (kind) => {
    expect(downloadFailureMessage(new DownloadFailure(kind, "x"), "fallback")).toBe(DOWNLOAD_FAILURE_MESSAGES[kind]);
  });

  it("uses the caller's words for any other failure", () => {
    const other: DownloadFailureKind = "other";
    expect(downloadFailureMessage(new DownloadFailure(other, "x"), "fallback")).toBe("fallback");
    expect(downloadFailureMessage(new Error("x"), "fallback")).toBe("fallback");
  });
});
