/**
 * Body for POST /jobs/analyze.
 *
 * Exactly one of `url` / `jd_text` must be present. The backend
 * validator enforces this — both-set or neither-set yields 422.
 */
export interface JobAnalysisRequest {
  url?: string;
  jd_text?: string;
}
