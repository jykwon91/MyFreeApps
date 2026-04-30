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

export const EMPLOYMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: EmploymentStatus;
  label: string;
}> = [
  { value: "employed", label: "Employed" },
  { value: "student", label: "Student" },
  { value: "self_employed", label: "Self-employed" },
  { value: "between_jobs", label: "Between jobs" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];
