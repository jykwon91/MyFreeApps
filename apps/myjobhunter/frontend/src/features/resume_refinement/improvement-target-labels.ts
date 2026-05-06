import type {
  ImprovementSeverity,
  ImprovementType,
} from "@/types/resume-refinement/improvement-target";

/**
 * UI labels for ``ImprovementType`` enum values. Lives in its own
 * constants module so the labels stay in one place — every
 * surface that displays a critique target reads from here.
 */
export const IMPROVEMENT_TYPE_LABEL: Record<ImprovementType, string> = {
  add_metric: "Add metric",
  add_outcome: "Add outcome",
  tighten_phrasing: "Tighten phrasing",
  remove_jargon: "Remove jargon",
  stronger_verb: "Stronger verb",
  add_scope: "Add scope",
  fix_grammar: "Fix grammar",
  other: "Improvement",
};

/**
 * UI labels for ``ImprovementSeverity`` enum values.
 */
export const SEVERITY_LABEL: Record<ImprovementSeverity, string> = {
  critical: "Critical",
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

/**
 * Per-severity Tailwind class fragment for the small inline badge.
 * Picked to match the bg-card / text contrast tokens in MJH's theme
 * — ``critical`` reads as destructive, ``low`` as muted.
 */
export const SEVERITY_BADGE_CLASS: Record<ImprovementSeverity, string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  medium: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  low: "bg-muted text-muted-foreground",
};
