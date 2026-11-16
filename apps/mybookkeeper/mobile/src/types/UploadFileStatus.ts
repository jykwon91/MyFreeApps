/** "reading" is a zip the server has and is still opening up, one document at a time. */
export type UploadFileStatus = "queued" | "uploading" | "reading" | "done" | "failed" | "cancelled";
