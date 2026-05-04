export interface SyncLog {
  id: number;
  status: "running" | "success" | "failed" | "partial" | "cancelled";
  records_added: number | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  total_items: number;
  emails_total: number;
  emails_done: number;
  emails_fetched: number;
  gmail_matches_total: number;
}
