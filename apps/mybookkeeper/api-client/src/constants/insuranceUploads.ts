/** A photo of a declarations page over a phone connection can outlast the default request timeout. */
export const INSURANCE_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** What a policy attachment or a document to read may be — matches the backend's allowed types. */
export const INSURANCE_UPLOAD_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];
