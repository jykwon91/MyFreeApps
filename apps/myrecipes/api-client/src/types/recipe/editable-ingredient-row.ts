/**
 * An ingredient row as it is being typed into the recipe editor, on web and phone. `key` is
 * client-only list identity (rows reorder and remove) and is never sent. `lineageKey` is carried
 * from a base version's ingredient so a tweak's diff tracks "same ingredient, changed".
 */
export interface EditableIngredientRow {
  key: string;
  name: string;
  /** Kept as text so the field can be empty; parsed on submit. */
  quantity: string;
  unit: string;
  note: string;
  /** Null for a new row. */
  lineageKey: string | null;
}
