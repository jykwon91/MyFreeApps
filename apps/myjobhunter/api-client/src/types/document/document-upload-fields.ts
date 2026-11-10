import type { DocumentKind } from "./document-kind";

/** The multipart fields of POST /documents/upload, with the file as the platform sends it. */
export interface DocumentUploadFields<Part> {
  title: string;
  kind: DocumentKind;
  application_id: string | null;
  file: Part;
}
