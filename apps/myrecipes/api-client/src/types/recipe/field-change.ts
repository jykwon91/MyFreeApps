/**
 * A change to one per-version field besides ingredients and steps. `before` is null for a field
 * that was empty (and for the first version, which has nothing before it); `after` is null for a
 * field that was cleared.
 */
export type FieldChange =
  | { field: "servings"; before: string | null; after: string | null }
  | { field: "prep_minutes" | "cook_minutes"; before: number | null; after: number | null };
