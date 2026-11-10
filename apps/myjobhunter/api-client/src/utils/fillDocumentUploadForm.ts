import type { DocumentUploadFields } from "../types/document/document-upload-fields";
import type { MultipartForm } from "../types/multipart-form";

/** Fills the caller's FormData for POST /documents/upload: title, kind, the application if any, then the file. */
export function fillDocumentUploadForm<Part>(form: MultipartForm<Part>, { title, kind, application_id, file }: DocumentUploadFields<Part>): void {
  form.append("title", title);
  form.append("kind", kind);
  if (application_id) form.append("application_id", application_id);
  form.append("file", file);
}
