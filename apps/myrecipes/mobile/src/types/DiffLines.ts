import type { DiffLine } from "./DiffLine";

/** A diff's changes as lines, by section. */
export interface DiffLines {
  fields: DiffLine[];
  ingredients: DiffLine[];
  steps: DiffLine[];
}
