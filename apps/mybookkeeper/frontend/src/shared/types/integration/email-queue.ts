export type EmailQueueStatus = "pending" | "fetched" | "extracting" | "done" | "failed";

export interface EmailQueueItem {
  id: string;
  sync_log_id: number;
  attachment_filename: string | null;
  email_subject: string | null;
  status: EmailQueueStatus;
  error: string | null;
  created_at: string | null;
}
