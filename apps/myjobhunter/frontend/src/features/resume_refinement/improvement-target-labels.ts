import type { ImprovementSeverity } from "@myjobhunter/api-client/types/resume-refinement/improvement-severity";

/**
 * Per-severity Tailwind class fragment for the small inline badge. Picked to match the bg-card /
 * text contrast tokens in MJH's theme — ``critical`` reads as destructive, ``low`` as muted. The
 * labels live in @myjobhunter/api-client's improvementSeverityLabels, shared with the phone.
 */
export const SEVERITY_BADGE_CLASS: Record<ImprovementSeverity, string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  medium: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  low: "bg-muted text-muted-foreground",
};
