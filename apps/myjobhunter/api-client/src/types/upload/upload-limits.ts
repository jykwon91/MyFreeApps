/** What an upload endpoint accepts: the content types it allows and its size cap. */
export interface UploadLimits {
  mimeTypes: readonly string[];
  maxBytes: number;
}
