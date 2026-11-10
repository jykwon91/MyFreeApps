import type { DocumentKind } from "./document-kind";

export interface DocumentUpdateRequest {
  title?: string;
  kind?: DocumentKind;
  body?: string | null;
  application_id?: string | null;
}
