import type { DimensionKey } from "../types/job-analysis/dimension-key";

/** Display label per dimension key. */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  skill_match: "Skill match",
  seniority: "Seniority",
  salary: "Salary",
  location_remote: "Location & remote",
  work_auth: "Work authorization",
};
