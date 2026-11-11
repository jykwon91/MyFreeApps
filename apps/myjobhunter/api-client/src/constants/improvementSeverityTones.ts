import type { ImprovementSeverity } from "../types/resume-refinement/improvement-severity";
import type { StatusTone } from "../types/status-tone";

/** The tone of each severity's badge: critical reads as danger, low as plain. */
export const IMPROVEMENT_SEVERITY_TONES: Record<ImprovementSeverity, StatusTone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};
