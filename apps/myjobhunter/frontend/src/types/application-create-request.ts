/**
 * Body for POST /applications. Mirrors `ApplicationCreateRequest` in
 * apps/myjobhunter/backend/app/schemas/application/application_create_request.py.
 *
 * Only `company_id` and `role_title` are required. Salary fields are sent
 * as strings (never numbers) to match the backend's Decimal handling and
 * avoid precision loss.
 */
export interface ApplicationCreateRequest {
  company_id: string;
  role_title: string;

  url?: string | null;
  jd_text?: string | null;
  jd_parsed?: Record<string, unknown> | null;

  source?: string | null;
  applied_at?: string | null;

  posted_salary_min?: string | null;
  posted_salary_max?: string | null;
  posted_salary_currency?: string;
  posted_salary_period?: string | null;

  location?: string | null;
  remote_type?: string;

  fit_score?: string | null;
  notes?: string | null;
  archived?: boolean;

  external_ref?: string | null;
  external_source?: string | null;
}
