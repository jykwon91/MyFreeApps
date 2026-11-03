/** A single ingredient line within a version snapshot (server response). */
export interface IngredientResponse {
  id: string;
  lineage_key: string;
  position: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}

/**
 * An ingredient line submitted when creating a recipe or a tweak.
 *
 * `lineage_key` is optional: carry it over from a base version's ingredient so
 * the diff engine tracks "same ingredient, changed"; omit it for a brand-new
 * ingredient and the backend assigns a fresh key.
 */
export interface IngredientInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
  lineage_key?: string | null;
}
