export type ResumeUploadJobStatus = "queued" | "processing" | "complete" | "failed" | "cancelled";

export interface ParseProvenanceEntry {
  kind: "work_bullet" | "summary";
  work_index?: number;
  company?: string | null;
  bullet_index?: number;
  text: string;
  unsourced_terms: string[];
}

export interface ParseProvenance {
  checked: boolean;
  flagged: ParseProvenanceEntry[];
}

export interface ResumeJobParsedFields {
  summary: string | null;
  headline: string | null;
  work_history_count: number;
  education_count: number;
  skills_count: number;
  /** Parse-time hallucination-guard verdicts. Absent on jobs parsed
   *  before the guard shipped (2026-07-02); null means unchecked. */
  provenance?: ParseProvenance | null;
}

export interface ResumeUploadJob {
  id: string;
  profile_id: string;
  file_filename: string | null;
  file_content_type: string | null;
  file_size_bytes: number | null;
  status: ResumeUploadJobStatus;
  error_message: string | null;
  result_parsed_fields: ResumeJobParsedFields | null;
  parser_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
