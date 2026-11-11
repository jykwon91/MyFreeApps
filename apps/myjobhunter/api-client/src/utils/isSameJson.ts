/** True when two JSON-like values hold the same data, whatever order their keys are in. */
export function isSameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => isSameJson(value, b[index]));
  if (Array.isArray(a) || Array.isArray(b) || a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).sort();
  return isSameJson(keys, Object.keys(right).sort()) && keys.every((key) => isSameJson(left[key], right[key]));
}
