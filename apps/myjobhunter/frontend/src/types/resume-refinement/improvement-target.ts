export type ImprovementType =
  | "add_metric"
  | "add_outcome"
  | "tighten_phrasing"
  | "remove_jargon"
  | "stronger_verb"
  | "add_scope"
  | "fix_grammar"
  | "other";

export type ImprovementSeverity = "critical" | "high" | "medium" | "low";

export type ImprovementTargetOrigin = "ai" | "user";

export interface ImprovementTarget {
  section: string;
  current_text: string;
  improvement_type: ImprovementType;
  severity: ImprovementSeverity;
  notes: string | null;
  /** "ai" for critique-chosen targets; "user" when the user clicked a
   *  draft line. Optional for tolerance of pre-migration payloads. */
  origin?: ImprovementTargetOrigin;
}
