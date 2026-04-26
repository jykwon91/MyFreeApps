export interface PlaidItem {
  id: string;
  institution_name: string | null;
  institution_id: string | null;
  status: "active" | "error" | "expired";
  error_code: string | null;
  last_synced_at: string | null;
  created_at: string;
}
