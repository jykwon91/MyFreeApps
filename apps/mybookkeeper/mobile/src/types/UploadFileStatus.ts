/** "reading" is a file the server has and is still reading: one document, or a zip opened up one document at a time. */
export type UploadFileStatus = "queued" | "uploading" | "reading" | "done" | "failed" | "cancelled";
