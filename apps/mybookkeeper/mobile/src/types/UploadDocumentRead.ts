import type { UploadOutcome } from "@mybookkeeper/api-client/types/document/UploadOutcome";

/** A sent file the server has finished reading, and how that went. */
export interface UploadDocumentRead {
  uri: string;
  outcome: UploadOutcome;
}
