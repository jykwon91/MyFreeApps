/**
 * What POST /documents/upload accepts. Mirrors `_ALLOWED_MIME_TYPES` in
 * apps/myjobhunter/backend/app/services/documents/document_service.py and
 * `settings.max_document_upload_bytes` in apps/myjobhunter/backend/app/core/config.py.
 * If either changes on the backend, change the copy here with it.
 */
export const DOCUMENT_UPLOAD_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/** The same types by name, for pickers that go by extension. */
export const DOCUMENT_UPLOAD_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".txt"];

export const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
