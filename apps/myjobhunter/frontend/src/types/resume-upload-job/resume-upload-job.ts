export type ResumeUploadJobStatus = "queued" | "processing" | "complete" | "failed" | "cancelled";

export interface ResumeJobParsedFields {
  summary: string | null;
  headline: string | null;
  work_history_count: number;
  education_count: number;
  skills_count: number;
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
