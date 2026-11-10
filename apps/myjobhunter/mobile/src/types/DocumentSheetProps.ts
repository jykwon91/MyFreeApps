import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentSheetProps {
  applicationId: string;
  /** Edits this document; writes a new one when absent. */
  document?: Document;
  onClose: () => void;
}
