/**
 * Mirrors backend ``ScreeningResultResponse``.
 */
export interface ScreeningResult {
  id: string;
  applicant_id: string;
  provider: string;
  status: string;
  report_storage_key: string | null;
  adverse_action_snippet: string | null;
  notes: string | null;
  requested_at: string;
  completed_at: string | null;
  created_at: string;
}
