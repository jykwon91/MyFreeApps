/** A diff's header in words: which versions it compares and how much changed. */
export interface DiffSummary {
  /** "v1", or "nothing" when the "to" version is the first. */
  fromLabel: string;
  toLabel: string;
  /** "v1 to v2". */
  title: string;
  /** Servings, prep time and cook time changes. */
  fieldCount: number;
  ingredientCount: number;
  stepCount: number;
  total: number;
  /** Nothing changed, not even the order. */
  isIdentical: boolean;
  /** Nothing was added, removed or edited, but the ingredients or steps are in another order. */
  isReordered: boolean;
  /**
   * "3 changes — 2 ingredients, 1 step.", "4 changes — 1 detail, 2 ingredients, 1 step." when a
   * servings or time changed, "Only the order changed." or "No differences between these versions."
   */
  subtitle: string;
}
