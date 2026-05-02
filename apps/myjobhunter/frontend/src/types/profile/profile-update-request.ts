/**
 * Body for PATCH /profile. All fields optional.
 * Mirrors ProfileUpdateRequest in backend/app/schemas/profile/profile_update_request.py.
 */
export interface ProfileUpdateRequest {
  work_auth_status?: string | null;
  desired_salary_min?: string | null;
  desired_salary_max?: string | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  locations?: string[] | null;
  remote_preference?: string | null;
  seniority?: string | null;
  summary?: string | null;
  timezone?: string | null;
}
