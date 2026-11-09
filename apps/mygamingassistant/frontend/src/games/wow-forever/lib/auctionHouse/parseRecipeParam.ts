/** A `?recipe=` value: a spell id, or null for anything else. */
export function parseRecipeParam(raw: string | null): number | null {
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  return Number(raw);
}
