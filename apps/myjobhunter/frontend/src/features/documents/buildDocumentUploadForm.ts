import type { DocumentUploadFormFields } from "@/types/document/document-upload-form-fields";

export function buildDocumentUploadForm({ title, kind, application_id, file }: DocumentUploadFormFields): FormData {
  const form = new FormData();
  form.append("title", title);
  form.append("kind", kind);
  if (application_id) form.append("application_id", application_id);
  form.append("file", file);
  return form;
}
