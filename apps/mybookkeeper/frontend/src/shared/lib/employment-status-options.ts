import type { EmploymentStatus } from "@mybookkeeper/api-client/types/inquiry/employment-status";

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
