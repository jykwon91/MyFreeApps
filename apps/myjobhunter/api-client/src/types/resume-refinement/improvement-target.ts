import type { ImprovementSeverity } from "./improvement-severity";
import type { ImprovementTargetOrigin } from "./improvement-target-origin";
import type { ImprovementType } from "./improvement-type";

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
