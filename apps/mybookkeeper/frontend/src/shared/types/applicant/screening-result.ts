/**
 * Mirrors backend ``ScreeningResultResponse``.
 *
 * PR 3.3 added ``uploaded_at`` / ``uploaded_by_user_id`` (the audit trail
 * for the host's report upload) and ``presigned_url`` (the short-lived URL
 * the browser uses to download the report PDF — the underlying object key
 * is never exposed publicly).
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
  uploaded_at: string;
  uploaded_by_user_id: string;
  created_at: string;
  presigned_url: string | null;
}
