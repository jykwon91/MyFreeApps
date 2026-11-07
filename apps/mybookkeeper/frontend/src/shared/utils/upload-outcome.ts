import type { DocumentStatus } from "@mybookkeeper/api-client/types/document/DocumentStatus";
import type { UploadOutcome } from "@/shared/types/document/upload-outcome";

/** How a single upload's extraction ended, or null while it's still being read. */
export function uploadOutcome(status: DocumentStatus): UploadOutcome | null {
  switch (status) {
    case "processing":
    case "extracting":
      return null;
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "duplicate":
    case "skipped":
    case "deleted":
      return "skipped";
  }
}
