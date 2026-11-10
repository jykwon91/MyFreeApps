/**
 * Verdict enum — matches the backend's job_analysis CheckConstraint.
 *
 * If a new verdict is added on the backend, this union MUST be updated
 * in the same PR (per the cross-stack-enum-change preference) or the
 * SPA crashes when prod data has the new value.
 */
export type JobAnalysisVerdict =
  | "strong_fit"
  | "worth_considering"
  | "stretch"
  | "mismatch";
