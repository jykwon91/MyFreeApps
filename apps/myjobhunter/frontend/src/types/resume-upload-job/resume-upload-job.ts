export type ResumeUploadJobStatus = "queued" | "processing" | "complete" | "failed" | "cancelled";

export interface ResumeUploadJob {
  id: string;
  profile_id: string;
  file_filename: string | null;
  file_content_type: string | null;
  file_size_bytes: number | null;
  status: ResumeUploadJobStatus;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
