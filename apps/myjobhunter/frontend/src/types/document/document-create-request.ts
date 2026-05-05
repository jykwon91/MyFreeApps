import type { DocumentKind } from "@/types/document/document-kind";

export interface DocumentCreateRequest {
  title: string;
  kind: DocumentKind;
  application_id?: string | null;
  body?: string | null;
}
