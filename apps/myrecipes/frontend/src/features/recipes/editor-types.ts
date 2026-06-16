/**
 * Local, editable row shapes for the recipe editor form. These carry a
 * client-only `key` for stable React list identity (rows reorder/remove) and,
 * for ingredients, the optional `lineage_key` carried over from a base version
 * so the backend diff engine tracks "same ingredient, changed" across a tweak.
 */
export interface EditableIngredientRow {
  /** Client-only stable id for React keys. Never sent to the server. */
  key: string;
  name: string;
  /** Kept as a string so the input can be empty; parsed on submit. */
  quantity: string;
  unit: string;
  note: string;
  /** Carried from the base version's ingredient; null for new rows. */
  lineageKey: string | null;
}

export interface EditableStepRow {
  /** Client-only stable id for React keys. Never sent to the server. */
  key: string;
  instruction: string;
}
