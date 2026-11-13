/** A from/to pair read low to high: a reversed pair is swapped, so "50 to 10" means 10 to 50. Pure. */
export function normalizeRange(min: number | null, max: number | null): [number | null, number | null] {
  if (min !== null && max !== null && min > max) return [max, min];
  return [min, max];
}
