import type { UploadOutcome } from "@mybookkeeper/api-client/types/document/UploadOutcome";
import type { UploadFileStatus } from "./UploadFileStatus";

/** One file on its way to the server, as the person sees it. */
export interface UploadFileProgress {
  /** Where it waits on the phone, which is what tells two files of the same name apart. */
  uri: string;
  name: string;
  status: UploadFileStatus;
  /** How much has gone out, 0 to 100, once the phone can tell. */
  percent: number | null;
  /** The batch the server is reading a sent zip as, while it can still be stopped. */
  batchId: string | null;
  /** The document a sent file became, checked on while it is being read. */
  documentId: string | null;
  /** How reading a sent file (not a zip) ended, once it has. */
  outcome: UploadOutcome | null;
}
