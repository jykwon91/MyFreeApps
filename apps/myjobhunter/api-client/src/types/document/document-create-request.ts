import type { DocumentKind } from "./document-kind";

export interface DocumentCreateRequest {
  title: string;
  kind: DocumentKind;
  application_id?: string | null;
  body?: string | null;
}
