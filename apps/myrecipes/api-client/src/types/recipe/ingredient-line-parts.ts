/**
 * The parts of an ingredient this formatter reads.
 *
 * Structural rather than a union of the concrete types, so a saved
 * ingredient, a diff snapshot, and an unsaved draft (photo import, web
 * discovery) all read identically without this module knowing about each of
 * them.
 */
export interface IngredientLineParts {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
}
