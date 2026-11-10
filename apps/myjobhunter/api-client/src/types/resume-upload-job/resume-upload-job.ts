import type { ResumeJobParsedFields } from "./resume-job-parsed-fields";
import type { ResumeUploadJobStatus } from "./resume-upload-job-status";

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
