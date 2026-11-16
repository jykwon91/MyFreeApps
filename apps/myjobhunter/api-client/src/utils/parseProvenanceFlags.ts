import type { ParseProvenanceEntry } from "../types/resume-upload-job/parse-provenance-entry";
import type { ResumeJobParsedFields } from "../types/resume-upload-job/resume-job-parsed-fields";

/** The lines the parse flagged as not found in the uploaded resume; empty when none were, or it wasn't checked. */
export function parseProvenanceFlags(parsed: Pick<ResumeJobParsedFields, "provenance">): ParseProvenanceEntry[] {
  return parsed.provenance?.flagged ?? [];
}
