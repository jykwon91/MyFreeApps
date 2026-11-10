import type { DocumentKind } from "@myjobhunter/api-client/types/document/document-kind";

/** What the upload dialog sends as multipart fields alongside the browser File. */
export interface DocumentUploadFormFields {
  title: string;
  kind: DocumentKind;
  application_id: string | null;
  file: File;
}
