/**
 * TypeScript type for POST /applications/parse-jd response.
 * Mirrors `JdParseResponse` in
 * apps/myjobhunter/backend/app/schemas/application/jd_parse_response.py.
 *
 * All fields are nullable — Claude may not extract every field from every JD.
 * Salary fields are numbers (not strings) because they are returned as JSON
 * numbers from the backend (unlike Application.posted_salary_* which are
 * Decimal → serialized as strings).
 */
export interface JdParseResponse {
  title: string | null;
  company: string | null;
  location: string | null;

  /** "remote" | "hybrid" | "onsite" | null */
  remote_type: string | null;

  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;

  /** "annual" | "monthly" | "hourly" | null */
  salary_period: string | null;

  /** "intern" | "entry" | "mid" | "senior" | "staff" | "principal" | "director" | null */
  seniority: string | null;

  must_have_requirements: string[];
  nice_to_have_requirements: string[];
  responsibilities: string[];

  summary: string | null;
}
