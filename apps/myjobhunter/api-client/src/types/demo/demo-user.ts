/**
 * One row in the admin demo-users list (`GET /admin/demo/users`).
 *
 * The summary counts (`application_count`, `company_count`) are the
 * meaningful "how much demo data does this account have" signal —
 * they replace MBK's `upload_count` because MJH doesn't have document
 * uploads in Phase 1.
 */
export interface DemoUser {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  application_count: number;
  company_count: number;
}
