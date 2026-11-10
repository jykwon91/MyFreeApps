/**
 * What POST /documents/upload accepts. Mirrors `_ALLOWED_MIME_TYPES` and
 * `_MAX_UPLOAD_BYTES` in apps/myjobhunter/backend/app/services/documents/document_service.py.
 */
export const DOCUMENT_UPLOAD_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/** The same types by name, for pickers that go by extension. */
export const DOCUMENT_UPLOAD_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".txt"];

export const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
