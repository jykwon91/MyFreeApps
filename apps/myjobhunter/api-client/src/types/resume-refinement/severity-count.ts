import type { ImprovementSeverity } from "./improvement-severity";

/** How many of the review's targets have one severity. */
export interface SeverityCount {
  severity: ImprovementSeverity;
  count: number;
}
