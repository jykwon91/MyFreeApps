/**
 * WorkHistory as returned by the backend.
 * Mirrors WorkHistoryResponse in backend/app/schemas/profile/work_history_response.py.
 */
export interface WorkHistory {
  id: string;
  user_id: string;
  profile_id: string;
  company_name: string;
  title: string;
  start_date: string;
  end_date: string | null;
  bullets: string[];
  created_at: string;
  updated_at: string;
}
