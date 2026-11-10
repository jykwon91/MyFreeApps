import type { JobAnalysisVerdict } from "@myjobhunter/api-client/types/job-analysis/job-analysis-verdict";

/**
 * Tailwind color classes per verdict — applied to the banner. Uses the
 * shadcn-style token system so dark mode flips automatically.
 */
export const VERDICT_BANNER_CLASSES: Record<JobAnalysisVerdict, string> = {
  strong_fit:
    "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200",
  worth_considering:
    "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
  stretch:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  mismatch:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200",
};
