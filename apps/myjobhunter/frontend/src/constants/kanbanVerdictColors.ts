import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { JobAnalysisVerdict } from "@myjobhunter/api-client/types/job-analysis/job-analysis-verdict";

/** Badge colour per verdict on a kanban card; unknown verdicts fall back to blue. */
export const KANBAN_VERDICT_COLORS: Record<JobAnalysisVerdict, BadgeColor> = {
  strong_fit: "green",
  worth_considering: "blue",
  stretch: "yellow",
  mismatch: "red",
};
