/**
 * Employment categories collected on the public inquiry form. Mirrors
 * backend ``INQUIRY_EMPLOYMENT_STATUSES``.
 */
export type EmploymentStatus =
  | "employed"
  | "student"
  | "self_employed"
  | "between_jobs"
  | "retired"
  | "other";
