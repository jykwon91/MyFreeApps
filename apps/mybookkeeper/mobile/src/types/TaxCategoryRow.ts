export interface TaxCategoryRow {
  category: string;
  label: string;
  cents: number;
  /** Why this amount isn't in the totals, when it isn't. */
  note: string | null;
}
