/**
 * TypeScript model for an Application as returned by the MJH backend.
 * Mirrors `ApplicationResponse` in
 * apps/myjobhunter/backend/app/schemas/application/application_response.py.
 *
 * Decimal columns from the backend (`posted_salary_*`, `fit_score`) are
 * serialized as strings over JSON because Decimal is not JSON-native.
 * The frontend treats them as `string | null` and formats them at render
 * time — never parses them to Number to avoid silent precision loss on
 * salary figures.
 */
export interface Application {
  id: string;
  user_id: string;
  company_id: string;

  role_title: string;
  url: string | null;
  jd_text: string | null;
  jd_parsed: Record<string, unknown> | null;

  source: string | null;
  applied_at: string | null;

  posted_salary_min: string | null;
  posted_salary_max: string | null;
  posted_salary_currency: string;
  posted_salary_period: string | null;

  location: string | null;
  remote_type: string;

  fit_score: string | null;
  notes: string | null;
  archived: boolean;

  external_ref: string | null;
  external_source: string | null;

  /**
   * Latest event_type from application_events, computed via lateral join.
   * null when the application has no events yet.
   * Only present in list responses (GET /applications).
   */
  latest_status: string | null;

  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
