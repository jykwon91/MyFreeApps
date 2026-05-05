/**
 * Discriminated union for the upload status banner's render mode.
 * Replaces stacked ternaries in DocumentUploadZone with a flat switch.
 */
export type UploadSubstatus =
  | "error-anonymous"
  | "error-named"
  | "uploading-multi"
  | "uploading-single"
  | "processing-batch"
  | "processing-extracting"
  | "processing-single"
  | "done-multi"
  | "done-batch"
  | "done-single";
