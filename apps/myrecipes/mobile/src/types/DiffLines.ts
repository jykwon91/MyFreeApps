import type { DiffLine } from "./DiffLine";

/** A diff's changes as lines, by section. */
export interface DiffLines {
  ingredients: DiffLine[];
  steps: DiffLine[];
}
