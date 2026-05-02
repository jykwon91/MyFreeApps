/**
 * Profile as returned by GET /profile and PATCH /profile.
 * Mirrors ProfileResponse in backend/app/schemas/profile/profile_response.py.
 */
export interface Profile {
  id: string;
  user_id: string;

  resume_file_path: string | null;
  parser_version: string | null;
  parsed_at: string | null;

  work_auth_status: string;

  desired_salary_min: string | null;
  desired_salary_max: string | null;
  salary_currency: string;
  salary_period: string;

  locations: string[];
  remote_preference: string;

  seniority: string | null;
  summary: string | null;
  timezone: string | null;

  created_at: string;
  updated_at: string;
}
