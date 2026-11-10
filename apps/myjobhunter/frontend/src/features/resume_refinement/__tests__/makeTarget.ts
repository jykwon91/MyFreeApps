import type { ImprovementTarget } from "@myjobhunter/api-client/types/resume-refinement/improvement-target";

export function makeTarget(currentText: string): ImprovementTarget {
  return {
    section: "Experience",
    current_text: currentText,
    improvement_type: "add_metric",
    severity: "high",
    notes: null,
    origin: "ai",
  };
}
