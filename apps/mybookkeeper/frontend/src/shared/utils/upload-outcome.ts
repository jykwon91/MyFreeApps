import { DOCUMENT_STATUSES, type DocumentStatus } from "@mybookkeeper/api-client/types/document/DocumentStatus";
import { UPLOAD_OUTCOMES, type UploadOutcome } from "@/shared/types/document/upload-outcome";

/** How a single upload's extraction ended, or null while it's still being read. */
export function uploadOutcome(status: DocumentStatus): UploadOutcome | null {
  switch (status) {
    case DOCUMENT_STATUSES.PROCESSING:
    case DOCUMENT_STATUSES.EXTRACTING:
      return null;
    case DOCUMENT_STATUSES.COMPLETED:
      return UPLOAD_OUTCOMES.DONE;
    case DOCUMENT_STATUSES.FAILED:
      return UPLOAD_OUTCOMES.FAILED;
    case DOCUMENT_STATUSES.DUPLICATE:
    case DOCUMENT_STATUSES.SKIPPED:
    case DOCUMENT_STATUSES.DELETED:
      return UPLOAD_OUTCOMES.SKIPPED;
  }
}
