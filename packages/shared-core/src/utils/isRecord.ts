/** True for a plain object, such as parsed JSON that isn't an array, `null` or a primitive. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
