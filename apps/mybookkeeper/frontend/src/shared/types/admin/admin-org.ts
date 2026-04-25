export interface AdminOrg {
  id: string;
  name: string;
  created_by: string;
  owner_email: string | null;
  created_at: string;
  member_count: number;
  transaction_count: number;
}
