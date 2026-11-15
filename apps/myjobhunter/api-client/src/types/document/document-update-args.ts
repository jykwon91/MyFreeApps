import type { DocumentUpdateRequest } from "./document-update-request";

export interface DocumentUpdateArgs {
  id: string;
  patch: DocumentUpdateRequest;
  /** The application the document belongs to before the change, so a move away from it refreshes it too. */
  applicationId: string | null;
}
