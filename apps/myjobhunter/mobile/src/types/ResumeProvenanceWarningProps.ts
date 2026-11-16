import type { ParseProvenanceEntry } from "@myjobhunter/api-client/types/resume-upload-job/parse-provenance-entry";

export interface ResumeProvenanceWarningProps {
  /** The flagged lines; shown only when there's at least one. */
  flagged: ParseProvenanceEntry[];
}
