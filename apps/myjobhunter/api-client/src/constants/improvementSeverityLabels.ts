import type { ImprovementSeverity } from "../types/resume-refinement/improvement-severity";

/** What each severity is called on its badge. */
export const IMPROVEMENT_SEVERITY_LABELS: Record<ImprovementSeverity, string> = {
  critical: "Critical",
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};
