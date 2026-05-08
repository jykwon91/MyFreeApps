/** Form-state enums for the New Saved Search dialog.
 *
 * Mirrors backend ``JSearchSourceConfig`` enums. Keeping these as
 * frontend-side string literal types means typos in the form code
 * fail at compile time, not at validation time.
 */

export type DatePosted = "all" | "today" | "3days" | "week" | "month";

export type Country = "us" | "ca" | "uk" | "au";

export type Experience =
  | ""
  | "no_experience"
  | "under_3_years_experience"
  | "more_than_3_years_experience"
  | "no_degree";

export type EmploymentType = "" | "FULLTIME" | "CONTRACTOR" | "PARTTIME" | "INTERN";
