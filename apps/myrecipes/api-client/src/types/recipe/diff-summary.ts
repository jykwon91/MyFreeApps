/** A diff's header in words: which versions it compares and how much changed. */
export interface DiffSummary {
  /** "v1", or "nothing" when the "to" version is the first. */
  fromLabel: string;
  toLabel: string;
  /** "v1 to v2". */
  title: string;
  ingredientCount: number;
  stepCount: number;
  total: number;
  isIdentical: boolean;
  /** "3 changes — 2 ingredient, 1 step." or "No differences between these versions." */
  subtitle: string;
}
