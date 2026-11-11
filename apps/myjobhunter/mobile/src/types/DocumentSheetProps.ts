import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentSheetProps {
  /** Links a new document to this application; none when absent, as on the Documents list. */
  applicationId?: string;
  /** Edits this document; writes a new one when absent. */
  document?: Document;
  onClose: () => void;
}
