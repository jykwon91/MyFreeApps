import type { ImprovementType } from "../types/resume-refinement/improvement-type";

/** What each kind of suggested improvement is called on its badge. */
export const IMPROVEMENT_TYPE_LABELS: Record<ImprovementType, string> = {
  add_metric: "Add metric",
  add_outcome: "Add outcome",
  tighten_phrasing: "Tighten phrasing",
  remove_jargon: "Remove jargon",
  stronger_verb: "Stronger verb",
  add_scope: "Add scope",
  fix_grammar: "Fix grammar",
  other: "Improvement",
};
