/**
 * Mirrors backend ``ScreeningResultResponse``. The report and adverse action
 * reason come from ``revealApplicantSensitive``.
 */
export interface ScreeningResult {
  id: string;
  applicant_id: string;
  provider: string;
  status: string;
  has_report: boolean;
  notes: string | null;
  requested_at: string;
  completed_at: string | null;
  uploaded_at: string;
  uploaded_by_user_id: string;
  created_at: string;
}
