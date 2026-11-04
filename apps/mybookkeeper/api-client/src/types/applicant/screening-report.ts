/** A screening result's private parts. Mirrors backend ``ScreeningReportResponse``. */
export interface ScreeningReport {
  id: string;
  adverse_action_snippet: string | null;
  presigned_url: string | null;
  /** `false` when the file is missing from storage. */
  is_available: boolean;
}
